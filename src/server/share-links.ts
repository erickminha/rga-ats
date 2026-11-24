import { textRecord } from '@/lib/i18n/pt-BR/assessment';
import { createHash, randomBytes } from 'node:crypto';
import { actorOf, emitEvent } from '@/server/events';
import { canManageRecruiting, type SessionContext } from '@/lib/session';
import { db } from '@/lib/db';
import type { SharePayload, ShareScope } from '@/lib/share-token';

const DAY = 86_400_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const LEGACY_CODE_RE = /^[A-Za-z0-9]{12}$/;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

function expiryDays() {
  const days = Number(process.env.RGA_SHARE_TTL_DAYS ?? '7');
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : 7;
}

export const shareablePosting = { state: 'PUBLISHED' } as const;
export function shareableOpportunity(orgId: string) {
  return { orgId, confidential: false, contact: { orgId, isAnonymized: false } };
}

export async function createRecruitingShare(ctx: SessionContext, scope: ShareScope, id: string): Promise<
  { code: string; expiresAt: Date } | { error: string; code?: never; expiresAt?: never }
> {
  if (!canManageRecruiting(ctx)) return { error: 'Seu perfil não pode compartilhar dados externamente.' } as const;
  const { orgId } = ctx;
  let target: { id: string } | null;
  switch (scope) {
    case 'candidate':
      target = await db.opportunity.findFirst({ where: { id, ...shareableOpportunity(orgId) }, select: { id: true } });
      break;
    case 'posting':
      target = await db.posting.findFirst({ where: { id, orgId, ...shareablePosting }, select: { id: true } });
      break;
    case 'client':
      target = await db.clientCompany.findFirst({
        where: { id, orgId, active: true, postings: { some: { orgId, ...shareablePosting } } },
        select: { id: true },
      });
      break;
    default:
      return { error: 'Tipo de compartilhamento inválido.' } as const;
  }
  if (!target) return { error: 'Registro indisponível para compartilhamento.' } as const;
  return persistShare(ctx, scope, target.id);
}

async function persistShare(ctx: SessionContext, scope: ShareScope, id: string, selection?: SharePayload['selection']) {
  const { orgId } = ctx;
  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + expiryDays() * DAY);
  await db.$transaction(async (tx) => {
    await tx.shareLink.create({ data: { code: tokenHash(code), orgId, scope, targetId: id, expiresAt, selection } });
    await emitEvent(tx, {
      orgId, ...actorOf(ctx), verb: 'share.created', subjectType: scope === 'candidate' ? 'opportunity' : scope === 'shortlist' ? 'posting' : scope,
      subjectId: id, payload: { expiresAt: expiresAt.toISOString(), ...(selection ? { count: selection.candidates.length } : {}) },
    });
  });
  return { code, expiresAt };
}

export async function revokeRecruitingShares(ctx: SessionContext, scope: ShareScope, id: string) {
  if (!canManageRecruiting(ctx) || !['posting', 'client', 'candidate', 'shortlist'].includes(scope)) {
    throw new Error('Seu perfil não pode revogar compartilhamentos.');
  }
  return db.$transaction(async (tx) => {
    const { count } = await tx.shareLink.updateMany({
      where: { orgId: ctx.orgId, scope, targetId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (count) await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'share.revoked', subjectType: scope === 'candidate' ? 'opportunity' : scope === 'shortlist' ? 'posting' : scope,
      subjectId: id, payload: { count },
    });
    return count;
  });
}

export async function resolveShare(token: string): Promise<SharePayload | null> {
  const code = TOKEN_RE.test(token) ? tokenHash(token) : LEGACY_CODE_RE.test(token) ? token : null;
  if (!code) return null;
  const link = await db.shareLink.findUnique({ where: { code } });
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) return null;
  if (link.scope === 'shortlist' && link.selection) {
    return { orgId: link.orgId, scope: 'shortlist', id: link.targetId, exp: link.expiresAt.getTime(), selection: link.selection as SharePayload['selection'] };
  }
  if (link.scope !== 'posting' && link.scope !== 'client' && link.scope !== 'candidate') return null;
  return { orgId: link.orgId, scope: link.scope, id: link.targetId, exp: link.expiresAt.getTime() };
}

export const finalistStageNames = ['Finalistas', 'Avaliação DISC', 'Parecer', 'Apresentação ao cliente'];
const professionalOpinion = (value: unknown) => {
  const fields = textRecord(value);
  return { history: fields.history || '', experience: fields.experience || '', competencies: fields.competencies || '', recommendation: fields.recommendation || '' };
};

const publicFinalists = (orgId: string, postingId: string) => ({
  ...shareableOpportunity(orgId), postingId, status: 'ACTIVE' as const,
  stage: { orgId, name: { in: finalistStageNames } },
});

async function shortlistPosting(orgId: string, postingId: string) {
  return db.posting.findFirst({
    where: { id: postingId, orgId, state: 'PUBLISHED', clientCompany: { orgId, active: true } },
    select: { id: true, title: true, clientCompanyId: true },
  });
}

export async function createShortlistShare(ctx: SessionContext, postingId: string, ids: string[], opinions: string[]) {
  if (!canManageRecruiting(ctx)) throw new Error('Seu perfil não pode apresentar finalistas.');
  if (!ids.length || ids.length > 30 || new Set(ids).size !== ids.length || opinions.some((id) => !ids.includes(id))) {
    throw new Error('Selecione de um a 30 finalistas e confira os pareceres.');
  }
  const posting = await shortlistPosting(ctx.orgId, postingId);
  if (!posting?.clientCompanyId) throw new Error('Vincule uma empresa ativa a uma vaga publicada.');
  const rows = await db.opportunity.findMany({
    where: { ...publicFinalists(ctx.orgId, postingId), id: { in: ids } },
    select: { id: true, recruitingAssessment: { select: { opinion: true, opinionFinalizedAt: true } } },
  });
  if (rows.length !== ids.length) throw new Error('A seleção contém uma participação indisponível para divulgação.');
  const candidates = rows.map((row) => {
    if (!opinions.includes(row.id)) return { id: row.id };
    if (!row.recruitingAssessment?.opinionFinalizedAt) throw new Error('Inclua somente pareceres finalizados.');
    return { id: row.id, opinionHash: tokenHash(JSON.stringify(professionalOpinion(row.recruitingAssessment.opinion))) };
  });
  return persistShare(ctx, 'shortlist', postingId, { clientId: posting.clientCompanyId, candidates });
}

export async function readShortlistShare(payload: SharePayload) {
  if (payload.scope !== 'shortlist' || !payload.selection) return null;
  const posting = await shortlistPosting(payload.orgId, payload.id);
  if (!posting || posting.clientCompanyId !== payload.selection.clientId) return null;
  const selected = new Map(payload.selection.candidates.map((item) => [item.id, item.opinionHash]));
  const candidates = await db.opportunity.findMany({
    where: { ...publicFinalists(payload.orgId, posting.id), id: { in: [...selected.keys()] } },
    select: {
      id: true, contact: { select: { name: true, headline: true } },
      recruitingAssessment: { select: { opinion: true, opinionFinalizedAt: true } },
    },
    orderBy: { contact: { name: 'asc' } },
  });
  return { title: posting.title, finalists: candidates.map((candidate) => {
    const content = professionalOpinion(candidate.recruitingAssessment?.opinion);
    const approved = candidate.recruitingAssessment?.opinionFinalizedAt
      && selected.get(candidate.id) === tokenHash(JSON.stringify(content));
    return { id: candidate.id, name: candidate.contact.name, headline: candidate.contact.headline, opinion: approved ? content : null };
  }) };
}
