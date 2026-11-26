import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { sheetCvRows, sheetSummaryRows } from '@/lib/rga-sheet-summary';
import { isAdmin, type SessionContext } from '@/lib/session';
import { summaryConsent } from '@/server/talent-summary';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';

const prefix = TALENT_SOURCE + ':id:';
export const cachedFile = (snapshot: Prisma.JsonValue) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return '';
  const file = snapshot.resumeDriveFileId;
  return typeof file === 'string' ? file : '';
};

export async function syncSheetSummaries(ctx: SessionContext, rows: string[][], transaction?: Prisma.TransactionClient) {
  if (!isAdmin(ctx) || !ctx.userId || ctx.orgId !== process.env.RGA_TALENT_SYNC_ORG_ID) throw new Error('Integração indisponível.');
  const client = transaction ?? db;
  const cv = rows[0]?.includes('Texto CV') ?? false;
  const parsed = cv ? sheetCvRows(rows) : sheetSummaryRows(rows);
  if (!parsed.length) return { imported: 0, remaining: 0, reviewFiles: [] as string[], cv };
  const refs = await client.importRef.findMany({ where: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
    externalId: { startsWith: prefix },
    OR: [
      { externalId: { in: parsed.flatMap(row => row.origin ? [prefix + row.origin] : []) } },
      ...[...new Set(parsed.map(row => row.file))].map(file => ({ snapshot: { path: ['resumeDriveFileId'], equals: file } })),
    ],
  }, select: { externalId: true, internalId: true, snapshot: true } });
  const byOrigin = new Map(refs.map(ref => [ref.externalId.slice(prefix.length), ref]));
  const byFile = new Map<string, typeof refs>();
  for (const ref of refs) {
    const file = cachedFile(ref.snapshot);
    if (file) byFile.set(file, [...(byFile.get(file) ?? []), ref]);
  }
  const candidates = parsed.flatMap(row => {
    const fileRefs = byFile.get(row.file) ?? [];
    const ref = row.origin ? byOrigin.get(row.origin) : fileRefs.length === 1 ? fileRefs[0] : undefined;
    if (!ref || cachedFile(ref.snapshot) !== row.file || fileRefs.length !== 1) return [];
    return [{ ...row, contactId: ref.internalId, externalId: ref.externalId,
      hash: createHash('sha256').update(JSON.stringify(['cvText' in row ? 'rga-sheet-cv-v1' : 'rga-sheet-summary-v1', row.file, row.text])).digest('hex') }];
  });
  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1);
  const contactIds = [...new Set(candidates.map(row => row.contactId))];
  const identityCounts = await client.importRef.groupBy({ by: ['internalId'], where: {
    orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
    externalId: { startsWith: prefix }, internalId: { in: contactIds },
  }, _count: { _all: true } });
  const unambiguous = new Set(identityCounts.filter(ref => ref._count._all === 1).map(ref => ref.internalId));
  const [current, cvTexts] = await Promise.all([
    client.talentSummary.findMany({ where: { orgId: ctx.orgId, contactId: { in: contactIds } },
      select: { contactId: true, inputHash: true, sourceKind: true } }),
    client.talentCvText.findMany({ where: { orgId: ctx.orgId, contactId: { in: contactIds } },
      select: { contactId: true, inputHash: true } }),
  ]);
  const saved = new Map(current.map(row => [row.contactId, row]));
  const cvHashes = new Map(cvTexts.map(row => [row.contactId, row.inputHash]));
  const eligible = await client.contact.findMany({ where: { ...summaryConsent(ctx.orgId), id: { in: candidates.map(row => row.contactId) } }, select: { id: true, name: true } });
  const names = new Map(eligible.map(person => [person.id, person.name]));
  const contentObject = (value: Prisma.JsonValue | undefined): Prisma.JsonObject =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const pending = candidates.filter(row => names.has(row.contactId) && unambiguous.has(row.contactId) && counts.get(row.contactId) === 1 &&
    ('cvText' in row || !(names.get(row.contactId)!.trim().split(/\s+/).length > 1 && row.text.toLocaleLowerCase('pt-BR').includes(names.get(row.contactId)!.trim().toLocaleLowerCase('pt-BR')))) &&
    ('cvText' in row ? cvHashes.get(row.contactId) !== row.hash :
      !(saved.get(row.contactId)?.sourceKind === 'PLANILHA' && saved.get(row.contactId)?.inputHash === row.hash)));
  let imported = 0;
  for (const row of pending.slice(0, 100)) {
    const apply = async (tx: Prisma.TransactionClient) => {
      if (!await lockIdentifiableContact(tx, ctx.orgId, row.contactId)) return 0;
      const person = await tx.contact.findFirst({ where: { id: row.contactId, ...summaryConsent(ctx.orgId) }, select: { name: true } });
      if (!person || (!('cvText' in row) && person.name.trim().split(/\s+/).length > 1 && row.text.toLocaleLowerCase('pt-BR').includes(person.name.trim().toLocaleLowerCase('pt-BR')))) return 0;
      const ref = await tx.importRef.findUnique({ where: { orgId_provider_kind_externalId: { orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER,
        kind: 'contact', externalId: row.externalId } }, select: { internalId: true, snapshot: true } });
      if (!ref || ref.internalId !== row.contactId || cachedFile(ref.snapshot) !== row.file) return 0;
      if ('cvText' in row) {
        const existing = await tx.talentCvText.findUnique({ where: { contactId: row.contactId },
          select: { orgId: true, inputHash: true } });
        if (existing && (existing.orgId !== ctx.orgId || existing.inputHash === row.hash)) return 0;
        const data = { text: row.cvText, inputHash: row.hash };
        await tx.talentCvText.upsert({ where: { contactId: row.contactId },
          create: { ...data, contactId: row.contactId, orgId: ctx.orgId }, update: data });
        await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'talent_cv.imported', subjectType: 'contact',
          subjectId: row.contactId, payload: { source: 'sheets', field: 'Texto CV', inputHash: row.hash, tokens: 0 } });
        return 1;
      }
      const previous = await tx.talentSummary.findUnique({ where: { contactId: row.contactId }, select: { orgId: true, inputHash: true, sourceKind: true, content: true } });
      if (previous && previous.orgId !== ctx.orgId) return 0;
      if (previous?.sourceKind === 'PLANILHA' && previous.inputHash === row.hash) return 0;
      const data = { status: 'READY', headline: row.headline, content: { ...contentObject(previous?.content), ...row.content } as Prisma.InputJsonObject, searchText: row.text,
        sourceKind: 'PLANILHA', sourceFileId: null, inputHash: row.hash, requestedHash: row.hash, provider: 'sheets', model: null,
        promptVersion: 'rga-sheet-summary-v1', tokens: 0, generatedAt: new Date(), leaseToken: null, leaseUntil: null, errorCode: null, attempts: 0 };
      await tx.talentSummary.upsert({ where: { contactId: row.contactId }, create: { ...data, contactId: row.contactId, orgId: ctx.orgId }, update: data });
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'talent_summary.imported', subjectType: 'contact',
        subjectId: row.contactId, payload: { source: 'sheets', inputHash: row.hash, tokens: 0 } });
      return 1;
    };
    imported += transaction ? await apply(transaction) : await db.$transaction(apply);
  }
  const matchedFiles = new Set(candidates.filter(row => unambiguous.has(row.contactId) && counts.get(row.contactId) === 1).map(row => row.file));
  return { imported, remaining: Math.max(0, pending.length - 100), reviewFiles: parsed.filter(row => !matchedFiles.has(row.file)).map(row => row.file), cv };
}
