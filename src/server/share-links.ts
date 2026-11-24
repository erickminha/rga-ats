import { publicOpinionKeys } from '@/lib/professional-opinion';
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
  contact: { orgId, isAnonymized: false, retentionHold: false },
  stage: { orgId, name: { in: finalistStageNames } },
});

async function shortlistPosting(orgId: string, postingId: string) {
  return db.posting.findFirst({
    where: { id: postingId, orgId, state: 'PUBLISHED', clientCompany: { orgId, active: true } },
    select: { id: true, title: true, clientCompanyId: true, clientCompany: { select: { name: true } } },
  });
}

export const safeOpinion = (value: unknown) => {
  const values = textRecord(value);
  return Object.fromEntries(publicOpinionKeys.map((key) => [key, values[key] || '']));
};
const hash = (value: unknown) => tokenHash(JSON.stringify(value));
const publicFile = (orgId: string, contactId: string, file: { id: string; orgId: string; contactId: string | null; deletePendingAt: Date | null } | null) =>
  file?.orgId === orgId && file.contactId === contactId && !file.deletePendingAt ? file.id : undefined;
export function shortlistReviewFingerprint(value: {
  name: string; headline: string | null; summary: Record<string, string>;
  version?: number; resumeId?: string; discId?: string;
}) {
  return hash([value.name, value.headline, publicOpinionKeys.map((key) => value.summary[key] ?? ''),
    value.version ?? null, value.resumeId ?? null, value.discId ?? null]);
}

const selectionForShortlist = {
  id: true, contactId: true, contact: { select: { name: true, headline: true } },
  applicationResume: { select: { id: true, orgId: true, contactId: true, deletePendingAt: true } },
  recruitingAssessment: { select: { opinion: true, opinionFinalizedAt: true,
    opinionVersions: { orderBy: { version: 'desc' as const }, take: 1, select: { version: true, issuedAt: true } },
    discFile: { select: { id: true, orgId: true, contactId: true, deletePendingAt: true } },
  } },
} as const;

export async function createShortlistShare(ctx: SessionContext, postingId: string, ids: string[], opinions: string[],
  documents: { pdf?: string[]; resumes?: string[]; discs?: string[]; reviewed?: Map<string, string> } = {}) {
  if (!canManageRecruiting(ctx)) throw new Error('Seu perfil não pode apresentar finalistas.');
  const { pdf = [], resumes = [], discs = [] } = documents;
  if (!ids.length || ids.length > 30 || new Set(ids).size !== ids.length ||
    [...opinions, ...pdf, ...resumes, ...discs].some((id) => !ids.includes(id))) {
    throw new Error('Selecione de um a 30 finalistas e confira os documentos.');
  }
  const posting = await shortlistPosting(ctx.orgId, postingId);
  if (!posting?.clientCompanyId) throw new Error('Vincule uma empresa ativa a uma vaga publicada.');
  const rows = await db.opportunity.findMany({
    where: { ...publicFinalists(ctx.orgId, postingId), id: { in: ids } },
    select: selectionForShortlist,
  });
  if (rows.length !== ids.length) throw new Error('A seleção contém uma participação indisponível para divulgação.');
  const candidates = rows.map((row) => {
    const assessment = row.recruitingAssessment;
    const version = assessment?.opinionVersions[0];
    if (documents.reviewed && documents.reviewed.get(row.id) !== shortlistReviewFingerprint({
      name: row.contact.name, headline: row.contact.headline, summary: safeOpinion(assessment?.opinion), version: version?.version,
      resumeId: publicFile(ctx.orgId, row.contactId, row.applicationResume),
      discId: publicFile(ctx.orgId, row.contactId, assessment?.discFile ?? null),
    })) throw new Error('A seleção mudou. Atualize a página e revise a apresentação.');
    const wantsSummary = opinions.includes(row.id);
    const wantsPdf = pdf.includes(row.id);
    const resumeId = resumes.includes(row.id) ? publicFile(ctx.orgId, row.contactId, row.applicationResume) : undefined;
    const discId = discs.includes(row.id) ? publicFile(ctx.orgId, row.contactId, assessment?.discFile ?? null) : undefined;
    if ((wantsSummary || wantsPdf) && !assessment?.opinionFinalizedAt) throw new Error('Inclua somente pareceres finalizados.');
    if ((wantsPdf && !version) || (resumes.includes(row.id) && !resumeId) || (discs.includes(row.id) && !discId)) {
      throw new Error('Documento indisponível para divulgação.');
    }
    return { id: row.id, resumeId, discId,
      opinionHash: wantsSummary ? 'v2:' + hash([safeOpinion(assessment?.opinion), version?.version]) : undefined,
      opinionPdfHash: wantsPdf ? hash([safeOpinion(assessment?.opinion), version?.version]) : undefined,
    };
  });
  return persistShare(ctx, 'shortlist', postingId, { clientId: posting.clientCompanyId, candidates });
}

export async function readShortlistShare(payload: SharePayload) {
  if (payload.scope !== 'shortlist' || !payload.selection) return null;
  const posting = await shortlistPosting(payload.orgId, payload.id);
  if (!posting || posting.clientCompanyId !== payload.selection.clientId) return null;
  const selected = new Map(payload.selection.candidates.map((item) => [item.id, item]));
  const candidates = await db.opportunity.findMany({
    where: { ...publicFinalists(payload.orgId, posting.id), id: { in: [...selected.keys()] } },
    select: selectionForShortlist,
    orderBy: { contact: { name: 'asc' } },
  });
  return { title: posting.title, client: posting.clientCompany?.name ?? '', finalists: candidates.map((candidate) => {
    const approval = selected.get(candidate.id);
    const assessment = candidate.recruitingAssessment;
    const content = safeOpinion(assessment?.opinion);
    const legacy = professionalOpinion(assessment?.opinion);
    const version = assessment?.opinionVersions[0];
    const versionHash = hash([content, version?.version]);
    const opinion = assessment?.opinionFinalizedAt && approval?.opinionHash === 'v2:' + versionHash ? content :
      assessment?.opinionFinalizedAt && approval?.opinionHash === hash(legacy) ? legacy : null;
    const opinionPdf = assessment?.opinionFinalizedAt && version && approval?.opinionPdfHash === versionHash
      ? { content, version: version.version, issuedAt: version.issuedAt } : null;
    const resumeId = publicFile(payload.orgId, candidate.contactId, candidate.applicationResume);
    const discId = publicFile(payload.orgId, candidate.contactId, assessment?.discFile ?? null);
    return { id: candidate.id, name: candidate.contact.name, headline: candidate.contact.headline, opinion, opinionPdf,
      resumeId: resumeId && resumeId === approval?.resumeId ? resumeId : null,
      discId: discId && discId === approval?.discId ? discId : null };
  }) };
}
