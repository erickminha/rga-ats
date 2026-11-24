import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mappingSuggestion, RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { isAdmin, type SessionContext } from '@/lib/session';
import { confirmRgaImport, previewRgaImport, RgaImportError, type RgaSpreadsheet } from './rga-spreadsheet';
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
    if (previous === fingerprint || (!retry && previous === 'erro:' + fingerprint)) continue;
    changed++;
    if (batch.length < LIMIT) batch.push({ key, fingerprint, sourceId, row: fields });
  }
  const csv = [keys, ...batch.map(item => item.row)].map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n');
  const file: RgaSpreadsheet = { name: 'sincronizacao.csv', data: Buffer.from(csv), kind: 'talent', headerRow: 1,
    mapping: Object.fromEntries(keys.map((key, i) => [key, String(i)])) };
  return { batch, file, unresolved, changed };
}

export async function syncTalentBatch(ctx: SessionContext, mode: 'preview' | 'confirm' | 'scheduled', ticket?: string, retry = false) {
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
  const { batch, file, unresolved, changed } = changedTalentRows(rows, new Map(saved.map(ref => [ref.externalId, ref.fingerprint])), retry);
  if (!batch.length) return { changed, unresolved, count: 0, report: null, ticket: null };
  const preview = await previewRgaImport(ctx, file);
  if (mode === 'preview') return { changed, unresolved, count: batch.length, ...preview };
  const checkpoint = async (tx: Prisma.TransactionClient, jobId: string, errors: Set<number>) => {
    await tx.importJob.update({ where: { id: jobId }, data: { accountName: 'Sincronização do Banco de Talentos', options: { kind: 'talent', source: PROVIDER, mode } } });
    const originalRefs = await tx.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
      externalId: { in: batch.map(item => TALENT_SOURCE + ':id:' + item.sourceId) } }, select: { externalId: true, internalId: true } });
    const contacts = new Map(originalRefs.map(ref => [ref.externalId, ref.internalId]));
    for (const [index, item] of batch.entries()) {
      const internalId = contacts.get(TALENT_SOURCE + ':id:' + item.sourceId);
      const key = { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact', externalId: item.key };
      const data = { internalId: internalId ?? jobId, jobId, syncedAt: new Date(), fingerprint: (errors.has(index + 2) || !internalId ? 'erro:' : '') + item.fingerprint };
      await tx.importRef.upsert({ where: { orgId_provider_kind_externalId: key }, create: { ...key, ...data, created: false }, update: data });
    }
  };
  const run = await confirmRgaImport(ctx, file, mode === 'scheduled' ? preview.ticket : ticket ?? '', checkpoint);
  return { changed, unresolved, count: batch.length, report: run.report, ticket: null };
}
