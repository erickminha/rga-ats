import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { isAdmin, type SessionContext } from '@/lib/session';
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

type Metadata = { size: number; md5: string; version: string };
async function source(ctx: SessionContext, contactId: string) {
  if (!ctx.userId || !isAdmin(ctx) || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new Error('FORBIDDEN');
  const folder = process.env.RGA_RESUME_FOLDER_ID;
  if (!folder || !idPattern.test(folder)) throw new Error('CONFIG');
  const contact = await db.contact.findFirst({ where: eligible(ctx.orgId, contactId), select: { id: true } });
  if (!contact) throw new Error('PRIVACY');
  const prefix = TALENT_SOURCE + ':id:';
  const refs = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
    internalId: contactId, externalId: { startsWith: prefix } }, take: 2, select: { externalId: true } });
  if (refs.length !== 1) throw new Error('IDENTITY');
  const driveId = linkedResume(await readTalentSheet(), refs[0].externalId.slice(prefix.length));
  if (!driveId) throw new Error('IDENTITY');
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

export async function previewDriveResume(ctx: SessionContext, contactId: string) {
  const { driveId, meta } = await source(ctx, contactId);
  const until = Date.now() + 15 * 60000;
  return { size: meta.size, version: meta.version, ticket: until + '.' + signature(ctx, contactId, driveId, meta, until) };
}

export async function confirmDriveResume(ctx: SessionContext, contactId: string, ticket: string) {
  const result = /^(\d{13})\.([0-9a-f]{64})$/.exec(ticket);
  if (!result || Number(result[1]) < Date.now()) throw new Error('STALE');
  const { driveId, meta, endpoint, headers } = await source(ctx, contactId);
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
