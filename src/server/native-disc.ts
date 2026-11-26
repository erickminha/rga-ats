import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { localDiscInterpretation, provisionalKey, questionnaireVersion, scoreDisc, simulationDiscInstrument, validDraft, validGroup, validatedDiscInterpretation, type Scores, type ScoringKey } from '@/lib/native-disc';
import { requestLimitActive, reserveRequest } from './request-limit';
import { discAiConfiguration, reserveDiscAi } from './disc-ai-settings';
import { lockIdentifiableContact } from './contact-lock';
import { sendPrivateEmail } from './email';
import { discChat } from './ai-client';
import { actorOf, emitEvent } from './events';

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');
const available = { confidential: false, contact: { isAnonymized: false, retentionHold: false } } satisfies Prisma.OpportunityWhereInput;

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

export function realDiscAvailable() {
  try {
    scoringKey(false);
    return true;
  } catch {
    return false;
  }
}

export async function createDiscInvite(ctx: SessionContext, opportunityId: string, days: number, simulation: boolean) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || !Number.isInteger(days) || days < 1 || days > 30) throw new Error('Informe um prazo entre 1 e 30 dias.');
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, orgId: ctx.orgId, status: 'ACTIVE', ...available },
    select: { contactId: true, posting: { select: { title: true } }, org: { select: { name: true, whatsappTemplates: true } },
      contact: { select: { name: true, emails: true, phones: true, careerProfile: true } } },
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
        !await tx.opportunity.findFirst({ where: { id: opportunityId, orgId: ctx.orgId, status: 'ACTIVE', ...available }, select: { id: true } })) {
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
  return { token, name: opportunity.contact.name, title: opportunity.posting.title,
    organization: opportunity.org, phones: opportunity.contact.phones, careerProfile: opportunity.contact.careerProfile };
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
    expiresAt: true, cancelledAt: true, questionnaireVersion: true, simulation: true,
    opportunity: { select: { orgId: true, contactId: true, confidential: true, contact: { select: { name: true, isAnonymized: true, retentionHold: true, emails: true } },
      posting: { select: { title: true } }, org: { select: { name: true, logoFileId: true } } } },
  } });
  const contact = row?.opportunity.contact;
  if (!row || !contact || row.opportunity.confidential || contact.isAnonymized || contact.retentionHold || row.cancelledAt ||
      (row.simulation && (row.opportunity.orgId !== process.env.RGA_DISC_TEST_ORG_ID || !contact.emails.length || !contact.emails.every(email => email.toLowerCase().endsWith('.invalid')))) ||
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
        data: { answers, revision: { increment: 1 }, ...(results ? { submittedAt: new Date(), results: { ...results, analysis: localDiscInterpretation(results), provider: 'local', model: 'rga-local-1', tokens: null, aiPending: !row.simulation } } : {}) },
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

async function emitAiAttempt(ctx: SessionContext, provider: string, model: string, tokens: number | null, success: boolean) {
  await db.$transaction(async tx => {
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.ai_attempt', subjectType: 'organization',
      subjectId: ctx.orgId, payload: { provider, model, tokens, success } });
  });
}

async function interpret(ctx: SessionContext, scores: Scores, methodology: string, simulation: boolean) {
  const orgId = ctx.orgId;
  const local = localDiscInterpretation(scores);
  if (!simulation) {
    const config = await discAiConfiguration(orgId);
    for (const { provider, model } of config.providers) {
      const cacheKey = fingerprint(JSON.stringify(['disc-interpretation-1', methodology, scores, provider, model]));
      const previous = await db.nativeDisc.findFirst({
        where: { simulation: false, opportunity: { orgId, ...available }, results: { path: ['cacheKey'], equals: cacheKey } },
        orderBy: { createdAt: 'desc' }, select: { results: true },
      });
      const saved = previous?.results as Record<string, unknown> | null;
      const cached = validatedDiscInterpretation(saved?.analysis);
      if (cached && saved?.provider === provider && saved.model === model) {
        return { analysis: { ...cached, profile: local.profile }, provider, model, tokens: 0, cacheKey, cached: true };
      }
      if (await requestLimitActive('disc-ai-circuit', [orgId, provider, model])) continue;
      if (!await reserveDiscAi(orgId, config.daily, config.monthly)) break;
      try {
        const result = await discChat(provider, { scores, methodology, profile: local.profile }, model);
        const analysis = validatedDiscInterpretation(result.value);
        await emitAiAttempt(ctx, provider, model, result.tokens, !!analysis);
        if (analysis) return { analysis: { ...analysis, profile: local.profile }, provider, model: result.model, tokens: result.tokens, cacheKey, cached: false };
      } catch { await emitAiAttempt(ctx, provider, model, null, false); }
      await reserveRequest('disc-ai-circuit', [orgId, provider, model], 1, 60000);
    }
  }
  return { analysis: local, provider: 'local', model: 'rga-local-1', tokens: null };
}

export async function prepareDisc(ctx: SessionContext, id: string) {
  requireRecruitingAccess(ctx);
  const pending = await db.nativeDisc.findFirst({ where: { id, submittedAt: { not: null }, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } },
    include: { opportunity: { select: { contactId: true } } } });
  if (!pending?.results) throw new Error('Avaliação indisponível.');
  const current = pending.results as Record<string, unknown>;
  if (current.analysis && current.aiPending !== true) return;
  if (!await reserveRequest('disc-interpretation', [id], 1, 60000)) throw new Error('A interpretação já está em processamento.');
  const key = pending.scoringKey as unknown as ScoringKey;
  const scores = scoreDisc(pending.answers, key);
  const interpretation = await interpret(ctx, scores, key.version, pending.simulation);
  await db.$transaction(async tx => {
    if (!await lockIdentifiableContact(tx, ctx.orgId, pending.opportunity.contactId)) return;
    const changed = await tx.nativeDisc.updateMany({ where: { id, revision: pending.revision, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } },
      data: { results: { ...scores, ...interpretation, aiPending: false }, revision: { increment: 1 } } });
    if (!changed.count) throw new Error('A avaliação mudou durante a interpretação. Atualize a página.');
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.interpreted', subjectType: 'opportunity',
      subjectId: pending.opportunityId, payload: { assessmentId: id, provider: interpretation.provider, model: interpretation.model, tokens: interpretation.tokens, cached: 'cached' in interpretation && interpretation.cached === true } });
  });
}

/** Edit text only; scores and the profile always come from the stored instrument. */
export async function editDiscInterpretation(ctx: SessionContext, id: string, revision: number, input: unknown) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || !Number.isSafeInteger(revision)) throw new Error('Revisão inválida.');
  const analysis = validatedDiscInterpretation(input);
  if (!analysis) throw new Error('Confira os campos e os limites da interpretação.');
  await db.$transaction(async tx => {
    const row = await tx.nativeDisc.findFirst({ where: { id, submittedAt: { not: null }, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } },
      include: { opportunity: { select: { contactId: true } } } });
    if (!row || !await lockIdentifiableContact(tx, ctx.orgId, row.opportunity.contactId)) throw new Error('Avaliação indisponível.');
    const scores = scoreDisc(row.answers, row.scoringKey as unknown as ScoringKey);
    const changed = await tx.nativeDisc.updateMany({ where: { id, revision, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } },
      data: { revision: { increment: 1 }, results: { ...scores, analysis: { ...analysis, profile: localDiscInterpretation(scores).profile },
        provider: 'manual', model: 'revisao-humana', tokens: null, aiPending: false,
        ...((row.results as Record<string, unknown> | null)?.sourceAssessmentId ? { sourceAssessmentId: String((row.results as Record<string, unknown>).sourceAssessmentId) } : {}) } } });
    if (!changed.count) throw new Error('A avaliação mudou. Atualize a página antes de editar.');
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.interpretation_edited', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: id, previousRevision: revision } });
  });
}

export async function reviewDisc(ctx: SessionContext, id: string) {
  requireRecruitingAccess(ctx);
  await db.$transaction(async tx => {
    const row = await tx.nativeDisc.findFirst({ where: { id, submittedAt: { not: null }, opportunity: { orgId: ctx.orgId, ...available } },
      include: { opportunity: { select: { contactId: true } } } });
    if (!row?.results || row.reviewedAt || !await lockIdentifiableContact(tx, ctx.orgId, row.opportunity.contactId) ||
      !await tx.opportunity.findFirst({ where: { id: row.opportunityId, orgId: ctx.orgId, ...available }, select: { id: true } })) return;
    const scores = scoreDisc(row.answers, row.scoringKey as unknown as ScoringKey);
    const prepared = row.results as Record<string, unknown>;
    const validated = validatedDiscInterpretation(prepared.analysis);
    if (!validated) throw new Error('Prepare a interpretação antes de concluir a revisão.');
    const analysis = { ...validated, profile: localDiscInterpretation(scores).profile };
    const changed = await tx.nativeDisc.updateMany({ where: { id, revision: row.revision, reviewedAt: null, opportunity: { orgId: ctx.orgId, ...available } }, data: { reviewedAt: new Date(), revision: { increment: 1 } } });
    if (!changed.count) throw new Error('A avaliação mudou. Revise novamente.');
    if (!row.simulation) {
      const disc = { D: String(scores.D), I: String(scores.I), S: String(scores.S), C: String(scores.C), scaleMin: '10', scaleMax: '40',
        instrument: 'DISC RGA', date: row.submittedAt!.toISOString().slice(0, 10), profile: analysis.profile, traits: [analysis.expected, analysis.detail].filter(Boolean).join('\n'),
        strengths: analysis.strengths.join('\n'), development: analysis.attention, complete: true };
      const assessment = await tx.recruitingAssessment.findUnique({ where: { opportunityId: row.opportunityId }, select: { disc: true, discFileId: true } });
      const historical = assessment?.disc;
      const replacedSimulation = historical && typeof historical === 'object' && !Array.isArray(historical) && historical.instrument === simulationDiscInstrument;
      if ((!historical || replacedSimulation) && !assessment?.discFileId) await tx.recruitingAssessment.upsert({ where: { opportunityId: row.opportunityId }, create: { opportunityId: row.opportunityId, disc }, update: { disc } });
    }
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.reviewed', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: id } });
  });
}

/** Recalculate into a separate immutable-source record, only against a newly approved key. */
export async function recalculateDisc(ctx: SessionContext, id: string) {
  if (!isAdmin(ctx) || !ctx.userId) throw new Error('Acesso restrito.');
  const key = scoringKey(false);
  await db.$transaction(async tx => {
    const row = await tx.nativeDisc.findFirst({ where: { id, simulation: false, submittedAt: { not: null }, reviewedAt: { not: null },
      opportunity: { orgId: ctx.orgId, ...available } }, include: { opportunity: { select: { contactId: true } } } });
    if (!row || !await lockIdentifiableContact(tx, ctx.orgId, row.opportunity.contactId) ||
        !await tx.opportunity.findFirst({ where: { id: row.opportunityId, orgId: ctx.orgId, ...available }, select: { id: true } })) throw new Error('Avaliação indisponível.');
    const previousKey = row.scoringKey as unknown as ScoringKey;
    if (previousKey.version === key.version) throw new Error('Não existe uma nova versão aprovada da metodologia.');
    const existing = await tx.nativeDisc.findFirst({ where: { opportunityId: row.opportunityId,
      AND: [{ results: { path: ['sourceAssessmentId'], equals: id } }, { scoringKey: { path: ['version'], equals: key.version } }] }, select: { id: true } });
    if (existing) throw new Error('A avaliação já foi recalculada nesta versão.');
    const scores = scoreDisc(row.answers, key);
    const created = await tx.nativeDisc.create({ data: { opportunityId: row.opportunityId, createdById: ctx.userId!,
      tokenHash: fingerprint(randomBytes(32).toString('base64url')), expiresAt: new Date(), submittedAt: row.submittedAt,
      questionnaireVersion: row.questionnaireVersion, scoringKey: key, simulation: false,
      answers: row.answers as Prisma.InputJsonValue, results: { ...scores, analysis: localDiscInterpretation(scores),
        provider: 'local', model: 'rga-local-1', tokens: null, aiPending: false, sourceAssessmentId: id } }, select: { id: true } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.recalculated', subjectType: 'opportunity',
      subjectId: row.opportunityId, payload: { assessmentId: created.id, sourceAssessmentId: id, previousVersion: previousKey.version, newVersion: key.version } });
  });
}

export async function recordDiscWhatsapp(ctx: SessionContext, token: string) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Convite inválido.');
  await db.$transaction(async tx => {
    const where = {
      tokenHash: fingerprint(token), simulation: false, cancelledAt: null, expiresAt: { gt: new Date() },
      opportunity: { orgId: ctx.orgId, ...available },
    };
    const row = await tx.nativeDisc.findFirst({ where, select: { id: true, opportunityId: true, opportunity: { select: { contactId: true } } } });
    if (!row || !await lockIdentifiableContact(tx, ctx.orgId, row.opportunity.contactId)
      || !await tx.nativeDisc.findFirst({ where, select: { id: true } })) throw new Error('Convite indisponível.');
    const event = { orgId: ctx.orgId, verb: 'disc.whatsapp_confirmed', subjectType: 'opportunity', subjectId: row.opportunityId } as const;
    if (await tx.event.findFirst({ where: { ...event, payload: { path: ['assessmentId'], equals: row.id } }, select: { id: true } })) return;
    await emitEvent(tx, { ...event, ...actorOf(ctx), payload: { assessmentId: row.id } });
  });
}
