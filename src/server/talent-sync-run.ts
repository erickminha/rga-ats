import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { readTalentSheetPage } from './imports/rga-google-source';
import { syncTalentPage, talentSyncLease } from './imports/rga-talent-sync';

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
      const day = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
      const previous = await tx.talentSyncRun.findFirst({ where: { orgId, mode, status: { in: ['SUCCEEDED', 'PARTIAL'] },
        createdAt: { gte: new Date(day + 'T00:00:00-03:00') } }, select: { id: true } });
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

export async function processTalentSync(orgId: string, requestedRunId?: string) {
  if (!talentSyncConfigured(orgId)) return { status: 'UNCONFIGURED' };
  const lease = await talentSyncLease(orgId);
  if (!lease) return { status: 'BUSY' };
  try {
    const run = await db.talentSyncRun.findFirst({ where: { orgId, id: requestedRunId, status: { in: pending } },
      orderBy: { createdAt: 'asc' } });
    const response = async (processed = 0) => {
      const id = run?.id ?? requestedRunId;
      const state = id ? await db.talentSyncRun.findFirst({ where: { id, orgId },
        select: { id: true, status: true, remaining: true, cvImported: true, errorCode: true, errors: true, unresolved: true, availableAt: true } }) : null;
      return { status: 'IDLE', ...state, processed, complete: state?.status === 'SUCCEEDED' };
    };
    if (!run || run.availableAt > new Date()) return response();
    const admin = await db.user.findFirst({ where: { orgId, id: process.env.RGA_TALENT_SYNC_ADMIN_ID!, deactivatedAt: null,
      accessRole: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, accessRole: true } });
    await db.$transaction(async tx => {
      await lease.assertOwned(tx);
      await tx.talentSyncRun.update({ where: { id: run.id }, data: admin ?
        { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } :
        { status: 'FAILED', finishedAt: new Date(), errorCode: 'responsible_account' } });
    });
    if (!admin) return response();
    let failureCode = 'source_read_failure';
    try {
      const page = await readTalentSheetPage(run.nextSheetRow, run.sourceEndRow ?? undefined);
      if (run.sourceHash && run.sourceHash !== page.sourceHash) throw new Error('sheet_reordered');
      failureCode = 'sync_write_failure';
      const result = await syncTalentPage({ orgId, userId: admin.id, accessRole: admin.accessRole }, page, run.nextSheetRow, run.id, lease.assertOwned);
      return response(result.count);
    } catch (error) {
      if (error instanceof Error && error.message === 'sync_lease_lost') return { status: 'BUSY' };
      const sourceChanged = error instanceof Error && error.message === 'sheet_reordered';
      const attempts = run.attempts + 1;
      const retry = !sourceChanged && attempts < 3;
      await db.$transaction(async tx => {
        await lease.assertOwned(tx);
        await tx.talentSyncRun.updateMany({ where: { id: run.id, status: 'RUNNING', nextSheetRow: run.nextSheetRow }, data: {
          status: retry ? 'QUEUED' : 'FAILED', availableAt: new Date(Date.now() + 300000 * 2 ** (attempts - 1)), attempts,
          errorCode: sourceChanged ? 'source_identity_changed' : failureCode,
          ...(retry ? {} : { finishedAt: new Date() }),
        } });
      });
      return response();
    }
  } finally { await lease(); }
}
