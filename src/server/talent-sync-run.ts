import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { takeCronLease } from './cron';
import { syncTalentBatch } from './imports/rga-talent-sync';

export function talentSyncConfigured(orgId: string) {
  return orgId === process.env.RGA_TALENT_SYNC_ORG_ID &&
    /^[a-zA-Z0-9_-]{10,180}$/.test(process.env.RGA_TALENT_SHEET_ID ?? '') &&
    Boolean(process.env.RGA_GOOGLE_SERVICE_ACCOUNT?.trim() && process.env.RGA_TALENT_SYNC_ADMIN_ID);
}

const pending = ['QUEUED', 'RUNNING'];

export async function enqueueTalentSync(orgId: string, mode: 'manual' | 'daily', requesterId: string | null) {
  if (!talentSyncConfigured(orgId)) throw new Error('Sincronização indisponível.');
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT true FROM (SELECT pg_advisory_xact_lock(hashtext(${'rga-sync:' + orgId}))) locked`;
    const active = await tx.talentSyncRun.findFirst({ where: { orgId, status: { in: pending } }, select: { id: true } });
    if (active) return active;
    if (mode === 'daily') {
      const day = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
      const previous = await tx.talentSyncRun.findFirst({ where: { orgId, mode, createdAt: { gte: new Date(day + 'T00:00:00-03:00') } }, select: { id: true } });
      if (previous) return previous;
    }
    return tx.talentSyncRun.create({ data: { orgId, mode, requestedById: requesterId }, select: { id: true } });
  });
}

export async function requestTalentSync(ctx: SessionContext) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId) throw new Error('Sessão indisponível.');
  return enqueueTalentSync(ctx.orgId, 'manual', ctx.userId);
}

export async function processTalentSync(orgId: string) {
  if (!talentSyncConfigured(orgId)) return { configured: false };
  const release = await takeCronLease('rga-talent-sheet:' + orgId, new Date(Date.now() + 540000));
  if (!release) return { busy: true };
  try {
    const run = await db.talentSyncRun.findFirst({ where: { orgId, status: { in: pending }, availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' } });
    if (!run) return { processed: 0 };
    const admin = await db.user.findFirst({ where: { orgId, id: process.env.RGA_TALENT_SYNC_ADMIN_ID!, deactivatedAt: null,
      accessRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, accessRole: true } });
    if (!admin) {
      await db.talentSyncRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'responsible_account' } });
      return { processed: 0 };
    }
    await db.talentSyncRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } });
    try {
      const result = await syncTalentBatch({ orgId, userId: admin.id, accessRole: admin.accessRole }, 'scheduled', undefined, false, run.id);
      return { processed: result.count, remaining: result.changed - result.count + ('summariesRemaining' in result ? result.summariesRemaining ?? 0 : 0), summariesImported: 'summariesImported' in result ? result.summariesImported ?? 0 : 0 };
    } catch {
      const attempts = run.attempts + 1;
      await db.talentSyncRun.updateMany({ where: { id: run.id, status: 'RUNNING' }, data: {
        status: attempts >= 3 ? 'FAILED' : 'QUEUED', availableAt: new Date(Date.now() + attempts * 300000), attempts,
        errorCode: 'source_or_write_failure', ...(attempts >= 3 ? { finishedAt: new Date() } : {}),
      } });
      return { processed: 0, retry: attempts < 3 };
    }
  } finally { await release(); }
}
