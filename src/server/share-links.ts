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

export async function createRecruitingShare(ctx: SessionContext, scope: ShareScope, id: string) {
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
  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + expiryDays() * DAY);
  await db.$transaction(async (tx) => {
    await tx.shareLink.create({ data: { code: tokenHash(code), orgId, scope, targetId: target.id, expiresAt } });
    await emitEvent(tx, {
      orgId, ...actorOf(ctx), verb: 'share.created', subjectType: scope === 'candidate' ? 'opportunity' : scope,
      subjectId: target.id, payload: { expiresAt: expiresAt.toISOString() },
    });
  });
  return { code, expiresAt };
}

export async function revokeRecruitingShares(ctx: SessionContext, scope: ShareScope, id: string) {
  if (!canManageRecruiting(ctx) || !['posting', 'client', 'candidate'].includes(scope)) {
    throw new Error('Seu perfil não pode revogar compartilhamentos.');
  }
  return db.$transaction(async (tx) => {
    const { count } = await tx.shareLink.updateMany({
      where: { orgId: ctx.orgId, scope, targetId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (count) await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'share.revoked', subjectType: scope === 'candidate' ? 'opportunity' : scope,
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
  if (link.scope !== 'posting' && link.scope !== 'client' && link.scope !== 'candidate') return null;
  return { orgId: link.orgId, scope: link.scope, id: link.targetId, exp: link.expiresAt.getTime() };
}
