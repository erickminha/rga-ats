import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, type SessionContext } from '@/lib/session';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { MAX_RESUME_BYTES } from '@/server/resume';
import { storeExtractedResume } from '@/server/resume-upload';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';
import { discardUnlinkedFile } from '@/server/storage';
import { textFields } from '@/server/text';
import { readGoogleToken, readTalentSheet } from './rga-google-source';

const provider = 'rga-drive-talentos';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{10,180}$/;
export function driveFileId(input: string) {
  try {
    const url = new URL(input.trim());
    if (url.origin !== 'https://drive.google.com' || url.username || url.password) return null;
    const id = url.pathname === '/open' ? url.searchParams.get('id') : /^\/file\/d\/([^/]+)(?:\/view)?\/?$/.exec(url.pathname)?.[1];
    return id && idPattern.test(id) ? id : null;
  } catch { return null; }
}

export function linkedResume(rows: string[][], origin: string) {
  const header = rows[0] ?? [];
  const idCol = header.indexOf('ID Origem');
  const fileCol = header.indexOf('Upload de Currículo');
  if (idCol < 0 || fileCol < 0 || idCol !== header.lastIndexOf('ID Origem') || fileCol !== header.lastIndexOf('Upload de Currículo')) return null;
  const matches = rows.slice(1).filter(row => row[idCol]?.trim() === origin);
  if (matches.length !== 1) return null;
  const id = driveFileId(matches[0][fileCol] ?? '');
  if (!id || rows.slice(1).some(row => row[idCol]?.trim() !== origin && driveFileId(row[fileCol] ?? '') === id)) return null;
  return id;
}

const eligible = (orgId: string, id: string) => ({ orgId, id, isAnonymized: false, retentionHold: false,
  consents: { some: { orgId, purpose: 'PROFILE_STORAGE' as const, withdrawnAt: null } } });

async function importedResumeId(orgId: string, contactId: string, rows?: string[][]) {
  const contact = await db.contact.findFirst({ where: eligible(orgId, contactId), select: { id: true } });
  if (!contact) throw new Error('PRIVACY');
  const prefix = TALENT_SOURCE + ':id:';
  const refs = await db.importRef.findMany({ where: { orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
    internalId: contactId, externalId: { startsWith: prefix } }, take: 2, select: { externalId: true } });
  if (refs.length !== 1) throw new Error('IDENTITY');
  const driveId = linkedResume(rows ?? await readTalentSheet(), refs[0].externalId.slice(prefix.length));
  if (!driveId) throw new Error('IDENTITY');
  return driveId;
}

export async function originalResumeUrl(ctx: SessionContext, contactId: string) {
  if (!ctx.userId || !canManageRecruiting(ctx)) throw new Error('FORBIDDEN');
  if (!originalResumeEnabled(ctx.orgId)) throw new Error('CONFIG');
  const id = await importedResumeId(ctx.orgId, contactId);
  return 'https://drive.google.com/open?id=' + encodeURIComponent(id);
}

export function originalResumeEnabled(orgId: string) {
  return orgId === process.env.RGA_TALENT_SYNC_ORG_ID &&
    Boolean(process.env.RGA_TALENT_SHEET_ID && process.env.RGA_GOOGLE_SERVICE_ACCOUNT);
}

type Metadata = { size: number; md5: string; version: string };
async function source(ctx: SessionContext, contactId: string, rows?: string[][]) {
  if (!ctx.userId || !isAdmin(ctx) || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new Error('FORBIDDEN');
  const folder = process.env.RGA_RESUME_FOLDER_ID;
  if (!folder || !idPattern.test(folder)) throw new Error('CONFIG');
  const driveId = await importedResumeId(ctx.orgId, contactId, rows);
  const token = await readGoogleToken('https://www.googleapis.com/auth/drive.readonly');
  const endpoint = 'https://www.googleapis.com/drive/v3/files/' + driveId;
  const headers = { authorization: 'Bearer ' + token };
  const res = await fetch(endpoint + '?supportsAllDrives=true&fields=id,parents,trashed,size,md5Checksum,version,mimeType', {
    headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('FILE');
  const meta = await res.json();
  if (meta.id !== driveId || meta.trashed !== false || !Array.isArray(meta.parents) || !meta.parents.includes(folder) ||
      typeof meta.version !== 'string' || !/^\d+$/.test(meta.version) || !/^[a-f0-9]{32}$/.test(meta.md5Checksum) ||
      !Number.isSafeInteger(Number(meta.size)) || Number(meta.size) < 1 || Number(meta.size) > MAX_RESUME_BYTES) throw new Error('FILE');
  return { endpoint, headers, driveId, meta: { size: Number(meta.size), md5: String(meta.md5Checksum), version: String(meta.version) } satisfies Metadata };
}

function signature(ctx: SessionContext, contactId: string, driveId: string, meta: Metadata, until: number) {
  if (!process.env.AUTH_SECRET) throw new Error('CONFIG');
  return createHmac('sha256', process.env.AUTH_SECRET).update(JSON.stringify([ctx.orgId, ctx.userId, contactId, driveId, meta, until])).digest('hex');
}

export async function previewDriveResume(ctx: SessionContext, contactId: string, rows?: string[][]) {
  const { driveId, meta } = await source(ctx, contactId, rows);
  const until = Date.now() + 15 * 60000;
  return { size: meta.size, version: meta.version, ticket: until + '.' + signature(ctx, contactId, driveId, meta, until) };
}

export async function confirmDriveResume(ctx: SessionContext, contactId: string, ticket: string, rows?: string[][]) {
  const result = /^(\d{13})\.([0-9a-f]{64})$/.exec(ticket);
  if (!result || Number(result[1]) < Date.now()) throw new Error('STALE');
  const { driveId, meta, endpoint, headers } = await source(ctx, contactId, rows);
  if (!timingSafeEqual(Buffer.from(signature(ctx, contactId, driveId, meta, +result[1])), Buffer.from(result[2]))) throw new Error('STALE');
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    const r2 = new URL(process.env.S3_ENDPOINT ?? '');
    if (!/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(r2.hostname) ||
        r2.protocol !== 'https:' || !process.env.S3_BUCKET || process.env.S3_BUCKET !== process.env.RGA_RESUME_R2_BUCKET) throw new Error('STORAGE');
  }
  const res = await fetch(endpoint + '?alt=media&supportsAllDrives=true', { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!res.ok || !res.body) throw new Error('FILE');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > meta.size) throw new Error('STALE');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (length !== meta.size || createHash('md5').update(bytes).digest('hex') !== meta.md5) throw new Error('STALE');
  const checksum = hash(bytes);
  const key = { orgId: ctx.orgId, provider, kind: 'file', externalId: hash(contactId + '/' + checksum) };
  // Avoid scanning and uploading unchanged bytes. The transaction repeats
  // the lookup under the contact lock when concurrent copies start together.
  if (await db.importRef.findUnique({ where: { orgId_provider_kind_externalId: key }, select: { id: true } })) return false;
  const { file, extracted } = await storeExtractedResume(ctx.orgId, { data: bytes, filename: 'curriculo' });
  let linked = false;
  try {
    linked = await db.$transaction(async tx => {
      if (!await lockIdentifiableContact(tx, ctx.orgId, contactId) || !await tx.contact.findFirst({ where: eligible(ctx.orgId, contactId), select: { id: true } })) throw new Error('PRIVACY');
      const existing = await tx.importRef.findUnique({ where: { orgId_provider_kind_externalId: key } });
      if (existing) return false;
      await tx.storedFile.update({ where: { id: file.id, orgId: ctx.orgId, deletePendingAt: { gt: new Date() } }, data: {
        contactId, resumeVersion: true, uploadedById: ctx.userId, resumeContent: extracted.text, deletePendingAt: null, ...textFields(extracted, new Date()),
      } });
      await tx.contact.updateMany({ where: { orgId: ctx.orgId, id: contactId, resumeFileId: null }, data: { resumeFileId: file.id, resumeText: extracted.text } });
      await tx.importRef.create({ data: { ...key, internalId: file.id, fingerprint: checksum, snapshot: { driveId, version: meta.version } } });
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'contact.resume_attached', subjectType: 'contact', subjectId: contactId,
        payload: { fileId: file.id, source: provider, version: meta.version } });
      return true;
    });
  } finally { if (!linked) await discardUnlinkedFile(ctx.orgId, file.id); }
  return linked;
}

const bulkKind = 'resume-batch';
const batchSize = 5;

/** Use the same confirmed single-file path for every member of a bounded lot. */
export async function driveBatch(ctx: SessionContext, tickets?: { id: string; ticket: string }[], offset = 0) {
  if (!isAdmin(ctx) || !ctx.userId || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new Error('FORBIDDEN');
  if (tickets && (!Array.isArray(tickets) || tickets.length > batchSize || !tickets.length ||
    new Set(tickets.map(t => t.id)).size !== tickets.length ||
    tickets.some(t => typeof t.id !== 'string' || typeof t.ticket !== 'string' || t.ticket.length > 100))) throw new Error('INVALID_BATCH');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5000) throw new Error('OFFSET');
  const rows = await readTalentSheet();
  const prefix = TALENT_SOURCE + ':id:';
  const [origins, markers, contacts] = await Promise.all([
    db.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact', externalId: { startsWith: prefix } },
      select: { externalId: true, internalId: true }, orderBy: { externalId: 'asc' } }),
    db.importRef.findMany({ where: { orgId: ctx.orgId, provider, kind: bulkKind }, select: { externalId: true } }),
    db.contact.findMany({ where: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false,
      consents: { some: { orgId: ctx.orgId, purpose: 'PROFILE_STORAGE', withdrawnAt: null } } }, select: { id: true } }),
  ]);
  const eligibleIds = new Set(contacts.map(c => c.id));
  const done = new Set(markers.map(m => m.externalId));
  const offers = new Map(tickets?.map(entry => [entry.id, entry.ticket]));
  const prepared: { id: string; ticket: string }[] = [];
  let pending = 0, blocked = 0, copied = 0, unchanged = 0, errors = 0, processed = 0;
  const keyColumn = rows[0]?.indexOf('ID Origem') ?? -1;
  const fileColumn = rows[0]?.indexOf('Upload de Currículo') ?? -1;
  if (keyColumn < 0 || fileColumn < 0) throw new Error('HEADERS');
  const byOrigin = new Map<string, string>();
  const seenFiles = new Set<string>();
  const ambiguousFiles = new Set<string>();
  for (const row of rows.slice(1)) {
    const key = row[keyColumn]?.trim();
    const file = driveFileId(row[fileColumn] ?? '');
    if (file && seenFiles.has(file)) ambiguousFiles.add(file);
    if (file) seenFiles.add(file);
    if (key) byOrigin.set(key, byOrigin.has(key) ? '' : file ?? '');
  }
  for (const ref of origins) {
    const id = ref.internalId;
    const file = byOrigin.get(ref.externalId.slice(prefix.length));
    if (!eligibleIds.has(id) || !file || ambiguousFiles.has(file)) { blocked++; continue; }
    const externalId = hash(id + '/' + file);
    if (done.has(externalId)) continue;
    pending++;
    if (tickets && !offers.has(id)) continue;
    // A failed metadata lookup must not prevent later files reaching review.
    // Preview performs no writes; callers can explicitly select another page.
    if (!tickets && (pending <= offset || pending > offset + batchSize)) continue;
    if (tickets) {
      try {
        const created = await confirmDriveResume(ctx, id, offers.get(id)!, rows);
        const key = { orgId: ctx.orgId, provider, kind: bulkKind, externalId };
        await db.importRef.upsert({ where: { orgId_provider_kind_externalId: key }, create: { ...key, internalId: id, created: false }, update: {} });
        if (created) copied++; else unchanged++;
      } catch { errors++; }
      processed++;
    } else {
      try { prepared.push({ id, ticket: (await previewDriveResume(ctx, id, rows)).ticket }); }
      catch { errors++; }
    }
  }
  if (tickets) errors += tickets.length - processed;
  return { pending, blocked, copied, unchanged, errors, tickets: prepared };
}
