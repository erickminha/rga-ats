import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mappingSuggestion, RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { isAdmin, type SessionContext } from '@/lib/session';
import { confirmRgaImport, previewRgaImport, RgaImportError, type RgaSpreadsheet } from './rga-spreadsheet';
import { queueTalentSummary, usesSheetSummaries } from '@/server/talent-summary';
import { explicitTalentConsent, prepareTalentRows, sheetResumeFileId } from '@/lib/rga-sheet-summary';
import { cachedFile, syncSheetSummaries } from './rga-sheet-summary';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';
import { readTalentSheetForImport, type readTalentSheetPage } from './rga-google-source';
import { takeCronLease } from '@/server/cron';

const PROVIDER = 'rga-google-talentos';
const LIMIT = 100;
const prefix = TALENT_SOURCE + ':id:';
export const talentSyncLease = (orgId: string) => takeCronLease('rga-talent-sheet:' + orgId, new Date(Date.now() + 540000));
type Page = Awaited<ReturnType<typeof readTalentSheetPage>>;
type Guard = (tx: Prisma.TransactionClient) => Promise<void>;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const verifiedTerm = (value: string) => hash(value.trim().replace(/\s+/g, ' ')) === '20b1ce34706f5790f82e468ebb5df1902dfd3e7264346bdd3f37261ef44512f8';

export function changedTalentRows(rows: string[][], saved: Map<string, string | null>, retry: boolean, stable = new Set<string>()) {
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
    if (stable.has(sourceId) && !previous?.startsWith('erro:')) continue;
    changed++;
    if (batch.length < LIMIT) batch.push({ key, fingerprint, sourceId, row: [...fields, driveFile, accepted ? 'sim' : ''], driveFile, accepted });
  }
  const csv = [[...keys, '_drive', '_aceite'], ...batch.map(item => item.row)].map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n');
  const file: RgaSpreadsheet = { name: 'sincronizacao.csv', data: Buffer.from(csv), kind: 'talent', headerRow: 1,
    mapping: Object.fromEntries(keys.map((key, i) => [key, String(i)])) };
  return { batch, file, unresolved, changed, skippedErrors, rowsRead: data.length };
}

export async function syncTalentBatch(ctx: SessionContext, mode: 'preview' | 'confirm' | 'scheduled', ticket?: string, retry = false) {
  requireSyncAdmin(ctx);
  if (mode === 'preview') return processBatch(ctx, await readTalentSheetForImport(), mode, ticket, retry);
  const lease = await talentSyncLease(ctx.orgId);
  if (!lease) throw new RgaImportError('Outra sincronização está em execução. Aguarde e gere uma nova prévia.');
  try {
    return await processBatch(ctx, await readTalentSheetForImport(), mode, ticket, retry, lease.assertOwned);
  } finally { await lease(); }
}

function requireSyncAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx) || !ctx.userId || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new RgaImportError('Integração indisponível para esta organização.');
}

export async function syncTalentPage(ctx: SessionContext, page: Page, start: number, runId: string, guard: Guard) {
  requireSyncAdmin(ctx);
  return processBatch(ctx, page.rows, 'scheduled', undefined, false, guard, { page, start, runId });
}

async function processBatch(ctx: SessionContext, rows: string[][], mode: 'preview' | 'confirm' | 'scheduled',
  ticket?: string, retry = false, guard?: Guard, progress?: { page: Page; start: number; runId: string }) {
  const header = rows[0] ?? [];
  const mapping = mappingSuggestion('talent', header);
  const idCol = Number(mapping.externalId);
  const fileCol = header.indexOf('Upload de Currículo');
  const source = progress?.page.index ?? rows;
  const pageFiles = [...new Set(rows.slice(1).map(row => sheetResumeFileId(row[fileCol] ?? '')).filter(Boolean))];
  const origins = [...new Set(rows.slice(1).map(row => row[idCol]?.trim()).filter(Boolean))];
  const lookup = { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact', externalId: { startsWith: prefix } };
  const refs = await db.importRef.findMany({ where: { ...lookup, OR: [
    { externalId: { in: origins.map(id => prefix + id) } },
    ...pageFiles.map(file => ({ snapshot: { path: ['resumeDriveFileId'], equals: file } })),
  ] }, select: { id: true, externalId: true, internalId: true, snapshot: true } });
  let sourceIds: string[] | undefined;
  if (header.filter(verifiedTerm).length === 1) {
    // Use the actual page for consent. The compact index is only identity evidence.
    const withConsent = progress ? source.map((row, i) => i >= progress.start - 1 && i < progress.page.next - 1 ? rows[i - progress.start + 2] : row) : rows;
    const prepared = prepareTalentRows(withConsent, refs.flatMap(ref => {
      const file = cachedFile(ref.snapshot);
      return file ? [{ origin: ref.externalId.slice(prefix.length), file }] : [];
    }), (file, date) => {
      const m = date.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
      const after = process.env.RGA_TALENT_DRIVE_ID_FROM;
      if (!m || !after || !Number.isFinite(Date.parse(after))) return '';
      const timestamp = Date.parse(m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '-03:00');
      return Number.isFinite(timestamp) && timestamp > Date.parse(after) ? 'DRIVE-RGA-' + hash(file) : '';
    });
    sourceIds = prepared.map(row => row[idCol]?.trim());
    rows = progress ? [header, ...prepared.slice(progress.start - 1, progress.page.next - 1)] : prepared;
  }

  const totals = new Map<string, number>();
  const files = new Map<string, number>();
  for (const [i, row] of source.slice(1).entries()) {
    const id = sourceIds?.[i + 1] ?? row[idCol]?.trim();
    const file = sheetResumeFileId(row[fileCol] ?? '');
    if (id) totals.set(id, (totals.get(id) ?? 0) + 1);
    if (file) files.set(file, (files.get(file) ?? 0) + 1);
  }
  const rowsRead = rows.slice(1).filter(row => row.some(cell => cell.trim())).length;
  let ambiguous = 0;
  const issues = new Map<number, string>();
  const bySource = new Map<string, number>();
  const byFile = new Map<string, number>();
  const existing = new Map(refs.map(ref => [ref.externalId.slice(prefix.length), ref]));
  rows = [header, ...rows.slice(1).filter((row, index) => {
    const id = row[idCol]?.trim();
    const file = sheetResumeFileId(row[fileCol] ?? '');
    const ref = id ? existing.get(id) : undefined;
    const cached = ref ? cachedFile(ref.snapshot) : '';
    const line = index + (progress?.start ?? 2);
    if ((id && totals.get(id) !== 1) || (file && files.get(file) !== 1) || (file && cached && cached !== file)) {
      issues.set(line, 'ambiguous_identity');
      ambiguous++;
      return false;
    }
    if ((!id || id.length > 180) && row.some(cell => cell.trim())) issues.set(line, 'invalid_origin');
    if (id) bySource.set(id, line);
    if (file) byFile.set(file, line);
    return true;
  })];

  const hashes = rows.slice(1).flatMap(row => row[idCol]?.trim() ? [hash(row[idCol].trim())] : []);
  const saved = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact',
    ...(progress ? { externalId: { in: hashes } } : {}) }, select: { externalId: true, fingerprint: true } });
  const sheetMode = usesSheetSummaries(ctx.orgId);
  const stable = new Set<string>();
  if (progress) {
    const contactIds = [...new Set(refs.map(ref => ref.internalId))];
    const consent = await db.consentRecord.findMany({ where: { orgId: ctx.orgId, purpose: 'PROFILE_STORAGE',
      contactId: { in: contactIds } }, select: { contactId: true }, distinct: ['contactId'] });
    const knownConsent = new Set(consent.map(record => record.contactId));
    for (const row of rows.slice(1)) {
      const id = row[idCol]?.trim();
      const ref = existing.get(id);
      if (!ref) continue;
      const file = sheetResumeFileId(row[fileCol] ?? '');
      if (!file || (cachedFile(ref.snapshot) === file && knownConsent.has(ref.internalId))) stable.add(id);
    }
  }
  const selection = changedTalentRows(rows, new Map(saved.map(ref => [ref.externalId, ref.fingerprint])), retry, stable);
  const { batch, file, changed, skippedErrors } = selection;
  const unresolved = selection.unresolved + ambiguous;
  file.preserveExistingTalents = true;
  const preview = batch.length ? await previewRgaImport(ctx, file) : null;
  if (mode === 'preview') return { changed, unresolved, count: batch.length, report: preview?.report ?? null, ticket: preview?.ticket ?? null };

  const apply = async (tx: Prisma.TransactionClient, jobId: string | null, errors: Set<number>, report?: import('@/lib/rga-import').RgaImportReport) => {
    await guard?.(tx);
    if (jobId) await tx.importJob.update({ where: { id: jobId }, data: {
      accountName: 'Sincronização do Banco de Talentos', options: { kind: 'talent', source: PROVIDER, mode, ...(progress ? {
        runId: progress.runId,
        sourceRowsWithError: [...errors].flatMap(row => {
          const line = bySource.get(batch[row - 2]?.sourceId);
          return line === undefined ? [] : [{ reportRow: row, sourceRow: line }];
        }),
      } : {}) },
    } });
    const originalRefs = await tx.importRef.findMany({ where: { ...lookup,
      externalId: { in: batch.map(item => prefix + item.sourceId) } }, select: { id: true, externalId: true, internalId: true, snapshot: true } });
    const contacts = new Map(originalRefs.map(ref => [ref.externalId, ref]));
    let queued = 0;
    let failures = 0;
    for (const [index, item] of batch.entries()) {
      const ref = contacts.get(prefix + item.sourceId);
      const internalId = ref?.internalId;
      const key = { orgId: ctx.orgId, provider: PROVIDER, kind: 'contact', externalId: item.key };
      const failed = errors.has(index + 2) || !internalId;
      if (failed) failures++;
      if (!failed && ref && item.driveFile && await lockIdentifiableContact(tx, ctx.orgId, ref.internalId)) {
        const eligible = await tx.contact.findFirst({ where: { id: ref.internalId, orgId: ctx.orgId, isAnonymized: false, retentionHold: false },
          select: { consents: { where: { orgId: ctx.orgId, purpose: 'PROFILE_STORAGE' }, select: { withdrawnAt: true } } } });
        const current = cachedFile(ref.snapshot);
        const conflict = (current && current !== item.driveFile) || await tx.importRef.findFirst({ where: { ...lookup,
          id: { not: ref.id }, snapshot: { path: ['resumeDriveFileId'], equals: item.driveFile } }, select: { id: true } });
        if (conflict) {
          const line = bySource.get(item.sourceId);
          if (line !== undefined) issues.set(line, 'conflicting_drive_link');
        }
        if (eligible && !conflict) {
          const consents = eligible.consents;
          if (item.accepted && !consents.length) {
            const consent = await tx.consentRecord.create({ data: { orgId: ctx.orgId, contactId: ref.internalId, purpose: 'PROFILE_STORAGE',
              policyVersion: 'rga-formulario-talentos-v1' }, select: { id: true } });
            await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'consent.reconciled', subjectType: 'contact', subjectId: ref.internalId,
              payload: { consentId: consent.id, evidence: 'Registro explícito na planilha', referenceHash: item.key, jobId } });
          }
          if (current !== item.driveFile && (consents.some(record => !record.withdrawnAt) || (item.accepted && !consents.length))) {
            const snapshot = ref.snapshot && typeof ref.snapshot === 'object' && !Array.isArray(ref.snapshot) ? ref.snapshot : {};
            await tx.importRef.update({ where: { id: ref.id }, data: { snapshot: { ...snapshot, resumeDriveFileId: item.driveFile } } });
          }
        }
      }
      if (!sheetMode && process.env.RGA_SUMMARY_AUTO === 'true' && internalId && !failed &&
          await queueTalentSummary(tx, ctx.orgId, internalId, 10)) queued++;
      const data = { internalId: internalId ?? jobId!, jobId, syncedAt: new Date(), fingerprint: (failed ? 'erro:' : '') + item.fingerprint };
      await tx.importRef.upsert({ where: { orgId_provider_kind_externalId: key }, create: { ...key, ...data, created: false }, update: data });
    }
    const imported = sheetMode ? await syncSheetSummaries(ctx, rows, tx) : { imported: 0, remaining: 0, reviewFiles: [], cv: false };
    if (progress) {
      const { page, start, runId } = progress;
      const current = await tx.talentSyncRun.findFirstOrThrow({ where: { id: runId, orgId: ctx.orgId, status: 'RUNNING', nextSheetRow: start } });
      const remaining = Math.max(0, page.end - page.next + 1);
      const errors = skippedErrors + failures;
      for (const file of imported.reviewFiles) {
        const line = byFile.get(file);
        if (line !== undefined && !issues.has(line)) issues.set(line, 'unconfirmed_cv_link');
      }
      const review = issues.size;
      const previousIssues = Array.isArray(current.reviewDetails) ? current.reviewDetails : [];
      const reviewDetails = [...previousIssues, ...[...issues].map(([row, reason]) => ({ row, reason }))].slice(0, 100);
      const partial = !!(current.unresolved + review + current.errors + errors);
      await tx.talentSyncRun.update({ where: { id: runId }, data: {
        sourceEndRow: page.end, sourceHash: page.sourceHash, nextSheetRow: page.next, remaining, attempts: 0, reviewDetails,
        rowsRead: { increment: rowsRead }, unresolved: { increment: review }, errors: { increment: errors },
        unchanged: { increment: Math.max(0, rowsRead - unresolved - changed - skippedErrors) },
        createdCount: { increment: report?.created ?? 0 }, updatedCount: { increment: report?.updated ?? 0 },
        duplicates: { increment: report?.duplicates ?? 0 },
        summaries: { increment: queued + (imported.cv ? 0 : imported.imported) },
        cvImported: { increment: imported.cv ? imported.imported : 0 },
        status: remaining ? 'RUNNING' : partial ? 'PARTIAL' : 'SUCCEEDED',
        errorCode: remaining || !partial ? null : 'review_rows',
        ...(remaining ? {} : { finishedAt: new Date() }),
      } });
    }
    return imported;
  };
  let imported: Awaited<ReturnType<typeof apply>> | undefined;
  let report = null;
  if (preview) {
    const run = await confirmRgaImport(ctx, file, mode === 'scheduled' ? preview.ticket : ticket ?? '', async (tx, jobId, errors, report) => {
      imported = await apply(tx, jobId, errors, report);
    });
    report = run.report;
  } else if (mode !== 'confirm') {
    imported = await db.$transaction(tx => apply(tx, null, new Set()), { timeout: 120_000 });
  }
  return { changed, unresolved, count: batch.length, report, ticket: null,
    summariesImported: imported?.imported ?? 0, summariesRemaining: imported?.remaining ?? 0 };
}
