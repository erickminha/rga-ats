import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mappingSuggestion, RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { isAdmin, type SessionContext } from '@/lib/session';
import { confirmRgaImport, previewRgaImport, RgaImportError, type RgaSpreadsheet } from './rga-spreadsheet';
import { queueTalentSummary, usesSheetSummaries } from '@/server/talent-summary';
import { explicitTalentConsent, prepareTalentRows, sheetResumeFileId } from '@/lib/rga-sheet-summary';
import { syncSheetSummaries } from './rga-sheet-summary';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';
import { readTalentSheet } from './rga-google-source';

const PROVIDER = 'rga-google-talentos';
const LIMIT = 100;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const verifiedTerm = (value: string) => hash(value.trim().replace(/\s+/g, ' ')) === '20b1ce34706f5790f82e468ebb5df1902dfd3e7264346bdd3f37261ef44512f8';

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
  const batch: { key: string; fingerprint: string; sourceId: string; row: string[]; driveFile: string; accepted: boolean }[] = [];
  const driveCol = headers.indexOf('Upload de Currículo') === headers.lastIndexOf('Upload de Currículo') ? headers.indexOf('Upload de Currículo') : -1;
  const terms = headers.flatMap((value, i) => verifiedTerm(value) ? [i] : []);
  const acceptCol = terms.length === 1 ? terms[0] : -1;
  const driveCounts = new Map<string, number>();
  for (const row of data) {
    const file = sheetResumeFileId(row[driveCol] ?? '');
    if (file) driveCounts.set(file, (driveCounts.get(file) ?? 0) + 1);
  }
  const keys = Object.keys(mapping);
  for (const row of data) {
    const sourceId = row[Number(mapping.externalId)]?.trim();
    if (!sourceId || counts.get(sourceId) !== 1 || sourceId.length > 180) { unresolved++; continue; }
    const key = hash(sourceId);
    const fields = keys.map(k => row[Number(mapping[k])] ?? '');
    const driveId = sheetResumeFileId(row[driveCol] ?? '');
    const driveFile = driveCounts.get(driveId) === 1 ? driveId : '';
    const accepted = !!driveFile && acceptCol >= 0 && explicitTalentConsent(row[acceptCol] ?? '');
    const fingerprint = hash(JSON.stringify([keys, fields, driveFile, accepted]));
    const previous = saved.get(key);
    if (previous === fingerprint) continue;
    if (!retry && previous === 'erro:' + fingerprint) { skippedErrors++; continue; }
    changed++;
    if (batch.length < LIMIT) batch.push({ key, fingerprint, sourceId, row: [...fields, driveFile, accepted ? 'sim' : ''], driveFile, accepted });
  }
  const csv = [[...keys, '_drive', '_aceite'], ...batch.map(item => item.row)].map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n');
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
  if (rows[0]?.filter(verifiedTerm).length === 1) {
    const prefix = TALENT_SOURCE + ':id:';
    const refs = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
      externalId: { startsWith: prefix } }, select: { externalId: true, snapshot: true } });
    rows = prepareTalentRows(rows, refs.flatMap(ref => {
      const snapshot = ref.snapshot;
      const file = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot.resumeDriveFileId : null;
      return typeof file === 'string' ? [{ origin: ref.externalId.slice(prefix.length), file }] : [];
    }), (file, date) => {
      // Only synthesize identities for new submissions after the reconciled historical export.
      // An older record with missing evidence must never be recreated after erasure.
      const m = date.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
      const after = process.env.RGA_TALENT_DRIVE_ID_FROM;
      if (!m || !after || !Number.isFinite(Date.parse(after))) return '';
      const timestamp = Date.parse(m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '-03:00');
      return Number.isFinite(timestamp) && timestamp > Date.parse(after) ? 'DRIVE-RGA-' + hash(file) : '';
    });
  }
  const sheetMode = usesSheetSummaries(ctx.orgId);
  const saved = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact' },
    select: { externalId: true, fingerprint: true } });
  const { batch, file, unresolved, changed, skippedErrors, rowsRead } = changedTalentRows(rows, new Map(saved.map(ref => [ref.externalId, ref.fingerprint])), retry);
  if (!batch.length) {
    const summaries = mode !== 'preview' && sheetMode ? await syncSheetSummaries(ctx, rows) : { imported: 0, remaining: 0 };
    if (runId && mode !== 'preview') {
      const previousRun = await db.talentSyncRun.findFirstOrThrow({ where: { id: runId, orgId: ctx.orgId }, select: { errors: true } });
      const partial = !!(unresolved || skippedErrors || previousRun.errors);
      await db.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId, rowsRead: 0 }, data: { unchanged: Math.max(0, rowsRead - unresolved - skippedErrors) } });
      await db.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId },
      data: { rowsRead, unresolved, summaries: { increment: summaries.imported }, remaining: skippedErrors + summaries.remaining, ...(summaries.remaining ? { status: 'RUNNING', errorCode: null } : { status: partial ? 'PARTIAL' : 'SUCCEEDED', finishedAt: new Date(), errorCode: partial ? 'review_rows' : null }) } });
    }
    return { changed, unresolved, count: 0, report: null, ticket: null, summariesImported: summaries.imported, summariesRemaining: summaries.remaining };
  }
  const preview = await previewRgaImport(ctx, file);
  if (mode === 'preview') return { changed, unresolved, count: batch.length, ...preview };
  const checkpoint = async (tx: Prisma.TransactionClient, jobId: string, errors: Set<number>, report: import('@/lib/rga-import').RgaImportReport) => {
    await tx.importJob.update({ where: { id: jobId }, data: { accountName: 'Sincronização do Banco de Talentos', options: { kind: 'talent', source: PROVIDER, mode } } });
    const originalRefs = await tx.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
      externalId: { in: batch.map(item => TALENT_SOURCE + ':id:' + item.sourceId) } }, select: { id: true, externalId: true, internalId: true, snapshot: true } });
    const contacts = new Map(originalRefs.map(ref => [ref.externalId, ref]));
    let summaries = 0;
    let failedRows = 0;
    for (const [index, item] of batch.entries()) {
      const ref = contacts.get(TALENT_SOURCE + ':id:' + item.sourceId);
      const internalId = ref?.internalId;
      const key = { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact', externalId: item.key };
      const failed = errors.has(index + 2) || !internalId;
      if (failed) failedRows++;
      const data = { internalId: internalId ?? jobId, jobId, syncedAt: new Date(), fingerprint: (failed ? 'erro:' : '') + item.fingerprint };
      if (!failed && ref && item.driveFile && await lockIdentifiableContact(tx, ctx.orgId, ref.internalId)) {
        const eligible = await tx.contact.findFirst({ where: { id: ref.internalId, orgId: ctx.orgId, isAnonymized: false, retentionHold: false }, select: { id: true } });
        const conflict = await tx.importRef.findFirst({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
          externalId: { startsWith: TALENT_SOURCE + ':id:' }, internalId: { not: ref.internalId },
          snapshot: { path: ['resumeDriveFileId'], equals: item.driveFile } }, select: { id: true } });
        if (eligible && !conflict) {
          const current = ref.snapshot;
          const snapshot = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
          if (item.accepted && !await tx.consentRecord.findFirst({ where: { orgId: ctx.orgId, contactId: ref.internalId, purpose: 'PROFILE_STORAGE' }, select: { id: true } })) {
            const consent = await tx.consentRecord.create({ data: { orgId: ctx.orgId, contactId: ref.internalId, purpose: 'PROFILE_STORAGE', policyVersion: 'rga-formulario-talentos-v1' }, select: { id: true } });
            await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'consent.reconciled', subjectType: 'contact', subjectId: ref.internalId,
              payload: { consentId: consent.id, evidence: 'Registro explícito na planilha', reference: item.sourceId, jobId } });
          }
          if (await tx.consentRecord.findFirst({ where: { orgId: ctx.orgId, contactId: ref.internalId, purpose: 'PROFILE_STORAGE', withdrawnAt: null }, select: { id: true } })) {
            await tx.importRef.update({ where: { id: ref.id }, data: { snapshot: { ...snapshot, resumeDriveFileId: item.driveFile } } });
          }
        }
      }
      if (!sheetMode && process.env.RGA_SUMMARY_AUTO === 'true' && internalId && !errors.has(index + 2) &&
          await queueTalentSummary(tx, ctx.orgId, internalId, 10)) summaries++;
      await tx.importRef.upsert({ where: { orgId_provider_kind_externalId: key }, create: { ...key, ...data, created: false }, update: data });
    }
    if (runId) {
      await tx.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId, rowsRead: 0 },
        data: { unchanged: Math.max(0, rowsRead - unresolved - changed - skippedErrors) } });
      await tx.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId }, data: {
      rowsRead, unresolved, remaining: Math.max(0, changed - batch.length), attempts: 0,
      createdCount: { increment: report.created }, updatedCount: { increment: report.updated },
      duplicates: { increment: report.duplicates }, errors: { increment: Math.max(report.errors, failedRows) }, summaries: { increment: summaries },
      errorCode: null,
      } });

    }
  };
  const run = await confirmRgaImport(ctx, file, mode === 'scheduled' ? preview.ticket : ticket ?? '', checkpoint);
  const imported = sheetMode ? await syncSheetSummaries(ctx, rows) : { imported: 0, remaining: 0 };
  if (runId) {
    const current = await db.talentSyncRun.findFirstOrThrow({ where: { id: runId, orgId: ctx.orgId }, select: { errors: true } });
    const partial = !!(unresolved || skippedErrors || current.errors);
    await db.talentSyncRun.updateMany({ where: { id: runId, orgId: ctx.orgId }, data: {
      summaries: { increment: imported.imported },
      remaining: Math.max(0, changed - batch.length) + imported.remaining + skippedErrors,
      ...(changed <= batch.length && !imported.remaining ? { status: partial ? 'PARTIAL' : 'SUCCEEDED',
        remaining: skippedErrors + current.errors, finishedAt: new Date(), errorCode: partial ? 'review_rows' : null } : {}),
    } });
  }
  return { changed, unresolved, count: batch.length, report: run.report, ticket: null, summariesImported: imported.imported, summariesRemaining: imported.remaining };
}
