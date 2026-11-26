import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mappingSuggestion, RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { isAdmin, type SessionContext } from '@/lib/session';
import { confirmRgaImport, previewRgaImport, RgaImportError, type RgaSpreadsheet } from './rga-spreadsheet';
import { queueTalentSummary } from '@/server/talent-summary';
import { readTalentSheet } from './rga-google-source';

const PROVIDER = 'rga-google-talentos';
const LIMIT = 100;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function changedTalentRows(rows: string[][], saved: Map<string, string | null>, retry: boolean) {
  const headers = rows[0] ?? [];
  const mapping = mappingSuggestion('talent', headers);
  if (mapping.externalId === undefined || mapping.name === undefined) throw new RgaImportError('Mapeie Nome Completo e ID Origem na fonte.');
  const data = rows.slice(1).filter(row => row.some(cell => cell.trim()));
  const counts = new Map<string, number>();
  for (const row of data) {
    const id = row[Number(mapping.externalId)]?.trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let unresolved = 0;
  let skippedErrors = 0;
  let changed = 0;
  const batch: { key: string; fingerprint: string; sourceId: string; row: string[] }[] = [];
  const keys = Object.keys(mapping);
  for (const row of data) {
    const sourceId = row[Number(mapping.externalId)]?.trim();
    if (!sourceId || counts.get(sourceId) !== 1 || sourceId.length > 180) { unresolved++; continue; }
    const key = hash(sourceId);
    const fields = keys.map(k => row[Number(mapping[k])] ?? '');
    const fingerprint = hash(JSON.stringify([keys, fields]));
    const previous = saved.get(key);
    if (previous === fingerprint) continue;
    if (!retry && previous === 'erro:' + fingerprint) { skippedErrors++; continue; }
    changed++;
    if (batch.length < LIMIT) batch.push({ key, fingerprint, sourceId, row: fields });
  }
  const csv = [keys, ...batch.map(item => item.row)].map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n');
  const file: RgaSpreadsheet = { name: 'sincronizacao.csv', data: Buffer.from(csv), kind: 'talent', headerRow: 1,
    mapping: Object.fromEntries(keys.map((key, i) => [key, String(i)])) };
  return { batch, file, unresolved, changed, skippedErrors, rowsRead: data.length };
}

export async function syncTalentBatch(ctx: SessionContext, mode: 'preview' | 'confirm' | 'scheduled', ticket?: string, retry = false, runId?: string) {
  if (!isAdmin(ctx) || !ctx.userId || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new RgaImportError('Integração indisponível para esta organização.');
  let rows: string[][];
  try { rows = await readTalentSheet(); }
  catch {
    if (mode === 'scheduled') await db.importJob.create({ data: {
      orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, accountName: 'Sincronização diária do Banco de Talentos',
      status: 'FAILED', options: { kind: 'talent', source: PROVIDER }, createdById: ctx.userId, finishedAt: new Date(),
      error: 'Não foi possível consultar a origem. Confira a configuração e repita a sincronização.',
    } });
    throw new RgaImportError('Não foi possível consultar a origem. Confira a configuração e tente novamente.');
  }
  const saved = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact' },
    select: { externalId: true, fingerprint: true } });
  const { batch, file, unresolved, changed, skippedErrors, rowsRead } = changedTalentRows(rows, new Map(saved.map(ref => [ref.externalId, ref.fingerprint])), retry);
  if (!batch.length) {
    if (runId) {
      await db.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId, rowsRead: 0 }, data: { unchanged: Math.max(0, rowsRead - unresolved - skippedErrors) } });
      await db.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId },
      data: { rowsRead, unresolved, remaining: skippedErrors, status: unresolved || skippedErrors ? 'PARTIAL' : 'SUCCEEDED', finishedAt: new Date(), errorCode: unresolved || skippedErrors ? 'review_rows' : null } });
    }
    return { changed, unresolved, count: 0, report: null, ticket: null };
  }
  const preview = await previewRgaImport(ctx, file);
  if (mode === 'preview') return { changed, unresolved, count: batch.length, ...preview };
  const checkpoint = async (tx: Prisma.TransactionClient, jobId: string, errors: Set<number>, report: import('@/lib/rga-import').RgaImportReport) => {
    await tx.importJob.update({ where: { id: jobId }, data: { accountName: 'Sincronização do Banco de Talentos', options: { kind: 'talent', source: PROVIDER, mode } } });
    const originalRefs = await tx.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
      externalId: { in: batch.map(item => TALENT_SOURCE + ':id:' + item.sourceId) } }, select: { externalId: true, internalId: true } });
    const contacts = new Map(originalRefs.map(ref => [ref.externalId, ref.internalId]));
    let summaries = 0;
    for (const [index, item] of batch.entries()) {
      const internalId = contacts.get(TALENT_SOURCE + ':id:' + item.sourceId);
      const key = { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact', externalId: item.key };
      const data = { internalId: internalId ?? jobId, jobId, syncedAt: new Date(), fingerprint: (errors.has(index + 2) || !internalId ? 'erro:' : '') + item.fingerprint };
      if (process.env.RGA_SUMMARY_AUTO === 'true' && internalId && !errors.has(index + 2) &&
          await queueTalentSummary(tx, ctx.orgId, internalId, 10)) summaries++;
      await tx.importRef.upsert({ where: { orgId_provider_kind_externalId: key }, create: { ...key, ...data, created: false }, update: data });
    }
    if (runId) {
      await tx.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId, rowsRead: 0 },
        data: { unchanged: Math.max(0, rowsRead - unresolved - changed - skippedErrors) } });
      await tx.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId }, data: {
      rowsRead, unresolved, remaining: Math.max(0, changed - batch.length), attempts: 0,
      createdCount: { increment: report.created }, updatedCount: { increment: report.updated },
      duplicates: { increment: report.duplicates }, errors: { increment: report.errors }, summaries: { increment: summaries },
      errorCode: null,
      } });
      if (changed <= batch.length) {
        const current = await tx.talentSyncRun.findFirstOrThrow({ where: { id: runId, orgId: ctx.orgId }, select: { errors: true } });
        const partial = !!(unresolved || skippedErrors || current.errors || errors.size);
        await tx.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId }, data: {
          status: partial ? 'PARTIAL' : 'SUCCEEDED', remaining: skippedErrors + errors.size,
          finishedAt: new Date(), errorCode: partial ? 'review_rows' : null,
        } });
      }
    }
  };
  const run = await confirmRgaImport(ctx, file, mode === 'scheduled' ? preview.ticket : ticket ?? '', checkpoint);
  return { changed, unresolved, count: batch.length, report: run.report, ticket: null };
}
