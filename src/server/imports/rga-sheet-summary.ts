import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { sheetSummaryRows } from '@/lib/rga-sheet-summary';
import { isAdmin, type SessionContext } from '@/lib/session';
import { summaryConsent } from '@/server/talent-summary';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';

const prefix = TALENT_SOURCE + ':id:';
const cachedFile = (snapshot: Prisma.JsonValue) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return '';
  const file = snapshot.resumeDriveFileId;
  return typeof file === 'string' ? file : '';
};

export async function syncSheetSummaries(ctx: SessionContext, rows: string[][]) {
  if (!isAdmin(ctx) || !ctx.userId || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new Error('Integração indisponível.');
  const parsed = sheetSummaryRows(rows);
  if (!parsed.length) return 0;
  const refs = await db.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
    externalId: { startsWith: prefix } }, select: { externalId: true, internalId: true, snapshot: true } });
  const byOrigin = new Map(refs.map(ref => [ref.externalId.slice(prefix.length), ref]));
  const byFile = new Map<string, typeof refs>();
  for (const ref of refs) {
    const file = cachedFile(ref.snapshot);
    if (file) byFile.set(file, [...(byFile.get(file) ?? []), ref]);
  }
  const candidates = parsed.flatMap(row => {
    const fileRefs = byFile.get(row.file) ?? [];
    const ref = row.origin ? byOrigin.get(row.origin) : fileRefs.length === 1 ? fileRefs[0] : undefined;
    if (!ref || fileRefs.some(other => other.internalId !== ref.internalId)) return [];
    return [{ ...row, contactId: ref.internalId, externalId: ref.externalId,
      hash: createHash('sha256').update(JSON.stringify(['rga-sheet-summary-v1', row.file, row.text])).digest('hex') }];
  });
  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1);
  const current = await db.talentSummary.findMany({ where: { orgId: ctx.orgId, contactId: { in: candidates.map(row => row.contactId) } },
    select: { contactId: true, inputHash: true, sourceKind: true } });
  const saved = new Map(current.map(row => [row.contactId, row]));
  const pending = candidates.filter(row => counts.get(row.contactId) === 1 &&
    !(saved.get(row.contactId)?.sourceKind === 'PLANILHA' && saved.get(row.contactId)?.inputHash === row.hash));
  let imported = 0;
  for (const row of pending) {
    imported += await db.$transaction(async tx => {
      if (!await lockIdentifiableContact(tx, ctx.orgId, row.contactId)) return 0;
      const person = await tx.contact.findFirst({ where: { id: row.contactId, ...summaryConsent(ctx.orgId) }, select: { name: true } });
      if (!person || (person.name.trim().split(/\s+/).length > 1 && row.text.toLocaleLowerCase('pt-BR').includes(person.name.trim().toLocaleLowerCase('pt-BR')))) return 0;
      const ref = await tx.importRef.findUnique({ where: { orgId_provider_kind_externalId: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER,
        kind: 'contact', externalId: row.externalId } }, select: { internalId: true, snapshot: true } });
      if (!ref || ref.internalId !== row.contactId || (!row.origin && cachedFile(ref.snapshot) !== row.file)) return 0;
      const previous = await tx.talentSummary.findUnique({ where: { contactId: row.contactId }, select: { orgId: true, inputHash: true, sourceKind: true } });
      if (previous && (previous.orgId !== ctx.orgId || (previous.sourceKind === 'PLANILHA' && previous.inputHash === row.hash))) return 0;
      const data = { status: 'READY', headline: row.headline, content: row.content, searchText: row.text,
        sourceKind: 'PLANILHA', sourceFileId: null, inputHash: row.hash, requestedHash: row.hash, provider: 'sheets', model: null,
        promptVersion: 'rga-sheet-summary-v1', tokens: 0, generatedAt: new Date(), leaseToken: null, leaseUntil: null, errorCode: null, attempts: 0 };
      await tx.talentSummary.upsert({ where: { contactId: row.contactId }, create: { ...data, contactId: row.contactId, orgId: ctx.orgId }, update: data });
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'talent_summary.imported', subjectType: 'contact',
        subjectId: row.contactId, payload: { source: 'sheets', inputHash: row.hash, tokens: 0 } });
      return 1;
    });
  }
  return imported;
}
