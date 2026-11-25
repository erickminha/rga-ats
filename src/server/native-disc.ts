import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { localDiscInterpretation, provisionalKey, questionnaireVersion, scoreDisc, validDraft, validGroup, validatedDiscInterpretation, type Scores, type ScoringKey } from '@/lib/native-disc';
import { reserveRequest } from './request-limit';
import { lockIdentifiableContact } from './contact-lock';
import { sendPrivateEmail } from './email';
import { discAiProviders, discChat } from './ai-client';
import { actorOf, emitEvent } from './events';

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');
const available = { contact: { isAnonymized: false, retentionHold: false } } satisfies Prisma.OpportunityWhereInput;

function scoringKey(simulation: boolean) {
  if (simulation) return provisionalKey;
  const raw = process.env.RGA_DISC_APPROVED_KEY;
  if (!raw) throw new Error('A chave para avaliações reais aguarda validação da RGA.');
  const key = JSON.parse(raw) as ScoringKey & { reference?: string };
  if (!key.reference?.trim() || !key.version?.trim() || key.version === provisionalKey.version) {
    throw new Error('Configure uma versão aprovada e a referência do instrumento.');
  }
  scoreDisc(Array.from({ length: 10 }, () => [1, 2, 3, 4]), key);
  return key;
}

export async function createDiscInvite(ctx: SessionContext, opportunityId: string, days: number, simulation: boolean) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || !Number.isInteger(days) || days < 1 || days > 30) throw new Error('Informe um prazo entre 1 e 30 dias.');
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, orgId: ctx.orgId, ...available },
    select: { contactId: true, posting: { select: { title: true } }, contact: { select: { name: true, emails: true } } },
  });
  if (!opportunity?.posting) throw new Error('Participação indisponível.');
  if (simulation && (ctx.orgId !== process.env.RGA_DISC_TEST_ORG_ID || !opportunity.contact.emails.length ||
    !opportunity.contact.emails.every(email => email.toLowerCase().endsWith('.invalid')))) {
    throw new Error('A chave provisória está restrita à organização de teste e a e-mails fictícios .invalid.');
  }
  const key = scoringKey(simulation);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86400000);
  await db.$transaction(async tx => {
    if (!await lockIdentifiableContact(tx, ctx.orgId, opportunity.contactId) ||
        !await tx.opportunity.findFirst({ where: { id: opportunityId, orgId: ctx.orgId, ...available }, select: { id: true } })) {
      throw new Error('Participação indisponível.');
    }
    await tx.nativeDisc.updateMany({ where: { opportunityId, submittedAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
    const invite = await tx.nativeDisc.create({ data: {
      opportunityId, createdById: ctx.userId!, tokenHash: fingerprint(token), expiresAt,
      questionnaireVersion, scoringKey: key, simulation,
    }, select: { id: true } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.invited', subjectType: 'opportunity',
      subjectId: opportunityId, payload: { assessmentId: invite.id, simulation, expiresAt: expiresAt.toISOString() } });
  });
  return { token, name: opportunity.contact.name, title: opportunity.posting.title };
}

export function discMessage(name: string, title: string, url: string) {
  return 'Olá, ' + name + '! Como parte do processo seletivo para a vaga de ' + title +
    ', solicitamos o preenchimento da avaliação comportamental DISC. Acesse o link e responda de acordo com seu comportamento habitual. ' + url + ' — RGA Consultoria de RH.';
}

export async function emailDisc(ctx: SessionContext, token: string, origin: string) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Convite inválido.');
  const row = await db.nativeDisc.findFirst({ where: {
    tokenHash: fingerprint(token), cancelledAt: null, submittedAt: null, simulation: false, expiresAt: { gt: new Date() },
    opportunity: { orgId: ctx.orgId, ...available },
  }, select: { id: true, opportunityId: true, opportunity: { select: {
    posting: { select: { title: true } }, contact: { select: { name: true, emails: true } },
  } } } });
  const recipient = row?.opportunity.contact.emails[0];
  if (!row || !row.opportunity.posting || !recipient || recipient.endsWith('.invalid') ||
    !await reserveRequest('disc-email', [row.id], 3, 3600000)) throw new Error('Envio indisponível.');
  await sendPrivateEmail({ toEmail: recipient, subject: 'Convite para avaliação DISC · RGA ATS',
    body: discMessage(row.opportunity.contact.name, row.opportunity.posting.title, origin + '/avaliacao-disc#' + token) });
  await db.$transaction(async tx => {
    await tx.nativeDisc.updateMany({ where: { id: row.id }, data: { emailedAt: new Date() } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.emailed', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: row.id } });
  });
}

export async function cancelDisc(ctx: SessionContext, id: string) {
  requireRecruitingAccess(ctx);
  await db.$transaction(async tx => {
    const row = await tx.nativeDisc.findFirst({ where: { id, opportunity: { orgId: ctx.orgId } }, select: { opportunityId: true } });
    if (!row) return;
    const updated = await tx.nativeDisc.updateMany({ where: { id, submittedAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
    if (updated.count) await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.cancelled', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: id } });
  });
}

export async function candidateDisc(token: string, change?: { answers: unknown; revision: number; submit: boolean }) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = fingerprint(token);
  // Random invalid tokens never create rate-limit rows.
  const row = await db.nativeDisc.findUnique({ where: { tokenHash }, select: {
    id: true, opportunityId: true, scoringKey: true, answers: true, revision: true, submittedAt: true,
    expiresAt: true, cancelledAt: true, questionnaireVersion: true,
    opportunity: { select: { orgId: true, contactId: true, contact: { select: { name: true, isAnonymized: true, retentionHold: true } },
      posting: { select: { title: true } }, org: { select: { name: true, logoFileId: true } } } },
  } });
  const contact = row?.opportunity.contact;
  if (!row || !contact || contact.isAnonymized || contact.retentionHold || row.cancelledAt ||
      +row.expiresAt <= Date.now() || row.questionnaireVersion !== questionnaireVersion) return null;
  if (!await reserveRequest('native-disc', [tokenHash], 100, 3600000)) return null;
  if (row.submittedAt) return { done: true as const };
  if (change) {
    const { answers, revision, submit } = change;
    if (!validDraft(answers) || !Number.isSafeInteger(revision) || (submit && !answers.every(validGroup))) return { error: 'Confira os valores de 1 a 4 em cada grupo.' };
    const results = submit ? scoreDisc(answers, row.scoringKey as unknown as ScoringKey) : undefined;
    const { orgId, contactId } = row.opportunity;
    const updated = await db.$transaction(async tx => {
      if (!await lockIdentifiableContact(tx, orgId, contactId)) return false;
      const update = await tx.nativeDisc.updateMany({
        where: { id: row.id, revision, submittedAt: null, cancelledAt: null, expiresAt: { gt: new Date() }, opportunity: available },
        data: { answers, revision: { increment: 1 }, ...(results ? { submittedAt: new Date(), results } : {}) },
      });
      if (update.count && submit) await emitEvent(tx, { orgId, actorType: 'candidate', actorId: contactId,
        verb: 'disc.submitted', subjectType: 'opportunity', subjectId: row.opportunityId, payload: { assessmentId: row.id } });
      return update.count === 1;
    });
    if (!updated) return { error: 'O preenchimento mudou em outra aba ou o link venceu. Recarregue para conferir.' };
    if (submit) return { done: true as const };
    return { saved: revision + 1 };
  }
  return { name: contact.name, title: row.opportunity.posting?.title, organization: row.opportunity.org,
    answers: validDraft(row.answers) ? row.answers : Array.from({ length: 10 }, () => [0, 0, 0, 0]), revision: row.revision };
}

async function interpret(orgId: string, scores: Scores, methodology: string, simulation: boolean) {
  const local = localDiscInterpretation(scores);
  if (!simulation) {
    const day = new Date().toISOString().slice(0, 10);
    const monthly = day.slice(0, 7);
    const dailyLimit = Number(process.env.RGA_DISC_AI_DAILY_LIMIT ?? 20);
    const monthlyLimit = Number(process.env.RGA_DISC_AI_MONTHLY_LIMIT ?? 200);
    if (Number.isSafeInteger(dailyLimit) && dailyLimit > 0 && Number.isSafeInteger(monthlyLimit) && monthlyLimit > 0) {
      for (const provider of discAiProviders().slice(0, 3)) {
        if (!await reserveRequest('disc-ai-daily', [orgId, day], dailyLimit, 86400000) ||
            !await reserveRequest('disc-ai-monthly', [orgId, monthly], monthlyLimit, 31 * 86400000)) break;
        try {
          const { value, model, tokens } = await discChat(provider, { scores, methodology, profile: local.profile });
          const analysis = validatedDiscInterpretation(value);
          if (analysis) return { analysis: { ...analysis, profile: local.profile }, provider, model, tokens };
        } catch { /* Try the next authorized provider; retain local interpretation on failure. */ }
      }
    }
  }
  return { analysis: local, provider: 'local', model: 'rga-local-1', tokens: null };
}

export async function reviewDisc(ctx: SessionContext, id: string) {
  requireRecruitingAccess(ctx);
  const pending = await db.nativeDisc.findFirst({ where: { id, submittedAt: { not: null }, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } } });
  if (!pending?.results) return;
  const key = pending.scoringKey as unknown as ScoringKey;
  const interpretation = await interpret(ctx.orgId, scoreDisc(pending.answers, key), key.version, pending.simulation);
  await db.$transaction(async tx => {
    const row = await tx.nativeDisc.findFirst({ where: { id, submittedAt: { not: null }, opportunity: { orgId: ctx.orgId, ...available } },
      include: { opportunity: { select: { contactId: true } } } });
    if (!row?.results || row.reviewedAt || !await lockIdentifiableContact(tx, ctx.orgId, row.opportunity.contactId) ||
      !await tx.opportunity.findFirst({ where: { id: row.opportunityId, orgId: ctx.orgId, ...available }, select: { id: true } })) return;
    const scores = scoreDisc(row.answers, row.scoringKey as unknown as ScoringKey);
    const { analysis } = interpretation;
    const disc = { D: String(scores.D), I: String(scores.I), S: String(scores.S), C: String(scores.C), scaleMin: '10', scaleMax: '40',
      instrument: row.simulation ? 'DISC RGA · Simulação' : 'DISC RGA', date: row.submittedAt!.toISOString().slice(0, 10), profile: analysis.profile, traits: analysis.detail,
      strengths: analysis.strengths.join('\n'), development: analysis.attention, complete: true };
    {
      const assessment = await tx.recruitingAssessment.findUnique({ where: { opportunityId: row.opportunityId }, select: { disc: true, discFileId: true } });
      if (!assessment?.disc && !assessment?.discFileId) await tx.recruitingAssessment.upsert({ where: { opportunityId: row.opportunityId }, create: { opportunityId: row.opportunityId, disc }, update: { disc } });
    }
    await tx.nativeDisc.update({ where: { id }, data: { reviewedAt: new Date(), results: { ...scores, ...interpretation } } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.reviewed', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: id } });
  });
}
