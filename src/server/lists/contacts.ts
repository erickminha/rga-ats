import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { encodeCursor, type CreatedCursor } from '@/lib/list-cursor';
import type { BoundedCount, ContactRow, ListPage } from '@/lib/list-types';
import { COUNT_CAP, PAGE_SIZE } from '@/server/lists/pipeline';

/**
 * The contacts list: newest first, keyset-paged on (createdAt DESC, id DESC)
 * — a backward walk of Contact_list_created_idx. The id tiebreak matters:
 * a CSV import writes hundreds of contacts under one timestamp.
 */

export type ContactsInput = { q?: string; tag?: string; pool?: string };

export type PoolRules = { q?: string; tag?: string; advanced?: boolean };
export type PoolRef = { id: string; kind: 'STATIC' | 'DYNAMIC'; rules: Prisma.JsonValue } | null;

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** A saved segment's live filter. */
export function rulesWhere(orgId: string, rules: PoolRules): Prisma.ContactWhereInput {
  if (rules.advanced) return { orgId, id: { in: [] } };
  const where: Prisma.ContactWhereInput = { orgId };
  const and: Prisma.ContactWhereInput[] = [];
  if (rules.q) and.push({ OR: [{ name: contains(rules.q) }, { headline: contains(rules.q) }] });
  if (rules.tag) and.push({ tags: { has: rules.tag } });
  return and.length ? { ...where, AND: and } : where;
}

/**
 * The filters as the list means them: the search trimmed, and blank ones
 * dropped. The page, its later pages, its total and the client's list key
 * (which trims too) must all describe the same list.
 */
export function normalizeContactsInput(input: ContactsInput): ContactsInput {
  const q = input.q?.trim();
  return { q: q || undefined, tag: input.tag || undefined, pool: input.pool || undefined };
}

export function contactsWhere(orgId: string, input: ContactsInput, pool: PoolRef): Prisma.ContactWhereInput {
  let where: Prisma.ContactWhereInput = { orgId, isAnonymized: false };
  if (pool) {
    where =
      pool.kind === 'DYNAMIC'
        ? rulesWhere(orgId, (pool.rules ?? {}) as PoolRules)
        : { orgId, pools: { some: { id: pool.id } } };
  }
  const refine: Prisma.ContactWhereInput[] = [];
  if (input.q) refine.push({ OR: [{ name: contains(input.q) }, { headline: contains(input.q) }] });
  if (input.tag) refine.push({ tags: { has: input.tag } });
  return { isAnonymized: false, AND: [where, ...refine] };
}

export async function resolvePool(orgId: string, poolId: string | undefined): Promise<PoolRef> {
  if (!poolId) return null;
  return db.talentPool.findFirst({
    where: { id: poolId, orgId },
    select: { id: true, kind: true, rules: true },
  });
}

/** One page of contacts after `after` (the previous page's endCursor). */
export async function contactsPage(
  orgId: string,
  input: ContactsInput,
  { after = null, limit = PAGE_SIZE, pool }: { after?: CreatedCursor | null; limit?: number; pool?: PoolRef } = {},
): Promise<ListPage<ContactRow>> {
  const n = Math.min(PAGE_SIZE, Math.max(1, Math.trunc(limit) || PAGE_SIZE));
  const resolved = pool === undefined ? await resolvePool(orgId, input.pool) : pool;
  // Always read a full page (+1) and cut it: the plan never depends on ?limit.
  // Prisma binds typed DateTimes as UTC, the same wall time the column holds.
  const at = after ? new Date(after.t.endsWith('Z') ? after.t : `${after.t}Z`) : null;
  const contacts = await db.contact.findMany({
    where: {
      AND: [
        contactsWhere(orgId, normalizeContactsInput(input), resolved),
        ...(after && at
          ? [{ createdAt: { lte: at } }, { OR: [{ createdAt: { lt: at } }, { id: { lt: after.id } }] }]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      name: true,
      headline: true,
      emails: true,
      tags: true,
      createdAt: true,
      retentionHold: true,
      opportunities: {
        where: { orgId, confidential: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          posting: { select: { title: true } },
          stage: { select: { name: true } },
          notes: { where: { orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true } },
        },
      },
    },
  });
  const page = contacts.slice(0, n);
  // Read only the two operational fields from the existing import ledger,
  // not its full snapshot or identifiers. One bounded query per page.
  const ids = page.filter(c => !c.retentionHold).map(c => c.id);
  const sourceRows = ids.length ? await db.$queryRaw<{ contactId: string; interest: string | null; observation: string | null }[]>`
    SELECT DISTINCT ON (r."internalId") r."internalId" AS "contactId",
      left(r.snapshot->'origemPlanilha'->>'cargo', 500) AS interest,
      left(r.snapshot->'origemPlanilha'->>'observacao', 1000) AS observation
    FROM "ImportRef" r
    WHERE r."orgId" = ${orgId} AND r.provider = ${RGA_IMPORT_PROVIDER} AND r.kind = 'contact'
      AND r."internalId" = ANY(${ids}::text[]) AND r."externalId" LIKE ${TALENT_SOURCE + ':id:%'}
    ORDER BY r."internalId", r."createdAt" DESC, r.id DESC
  ` : [];
  const sourceById = new Map(sourceRows.map(row => [row.contactId, row]));
  const last = page[page.length - 1];
  const hasMore = contacts.length > n;
  return {
    hasMore,
    endCursor:
      hasMore && last ? encodeCursor({ v: 1, s: 'created', t: last.createdAt.toISOString(), id: last.id }) : null,
    rows: page.map((c) => {
      const latest = c.opportunities[0];
      const source = sourceById.get(c.id);
      return {
        id: c.id,
        name: c.name,
        headline: c.headline,
        desiredRole: c.headline?.trim() || source?.interest?.trim() || null,
        observation: c.retentionHold ? null : source?.observation?.trim() || latest?.notes[0]?.body.slice(0, 1000).trim() || null,
        registeredAt: c.createdAt.toISOString(),
        email: c.emails[0] ?? null,
        tags: c.tags,
        latestOppId: latest?.id ?? null,
        latestPosting: latest?.posting?.title ?? null,
        latestStage: latest ? (latest.status === 'ARCHIVED' ? 'Encerrado' : latest.stage.name) : null,
        archived: latest?.status === 'ARCHIVED',
      };
    }),
  };
}

/** How many contacts match, stopping at `cap` (a count past it reads "cap+"). */
export async function boundedContactCount(
  where: Prisma.ContactWhereInput,
  cap = COUNT_CAP,
): Promise<BoundedCount> {
  const n = await db.contact.count({ where, take: cap + 1 });
  return n > cap ? { count: cap, capped: true } : { count: n, capped: false };
}

/**
 * Members per pool. Static pools count the join table alone — an index-only
 * scan, where counting through Contact read a heap page per member. Dynamic
 * segments are live filters, so they are bounded counts.
 */
export async function poolCounts(
  orgId: string,
  pools: { id: string; kind: 'STATIC' | 'DYNAMIC'; rules: Prisma.JsonValue }[],
  cap = COUNT_CAP,
): Promise<Record<string, BoundedCount>> {
  const staticIds = pools.filter((p) => p.kind === 'STATIC').map((p) => p.id);
  const [members, dynamic] = await Promise.all([
    staticIds.length
      ? db.$queryRaw<{ id: string; n: number }[]>`
          SELECT "B" AS id, count(*)::int AS n FROM "_PoolMembers" WHERE "B" = ANY(${staticIds}::text[]) GROUP BY 1`
      : Promise.resolve([]),
    Promise.all(
      pools
        .filter((p) => p.kind === 'DYNAMIC')
        .map(async (p) => [p.id, await boundedContactCount(rulesWhere(orgId, (p.rules ?? {}) as PoolRules), cap)] as const),
    ),
  ]);
  const out: Record<string, BoundedCount> = {};
  for (const id of staticIds) out[id] = { count: 0, capped: false };
  for (const m of members) out[m.id] = { count: m.n, capped: false };
  for (const [id, c] of dynamic) out[id] = c;
  return out;
}

/**
 * The total under the list: exact for everyone (cheap, index-only) and for a
 * static pool with no search; bounded for anything filtered by text or tag.
 */
export async function contactsTotal(
  orgId: string,
  input: ContactsInput,
  pool: PoolRef,
  cap = COUNT_CAP,
): Promise<BoundedCount> {
  input = normalizeContactsInput(input);
  if (!input.q && !input.tag) {
    if (!pool) return { count: await db.contact.count({ where: { orgId } }), capped: false };
    if (pool.kind === 'STATIC') {
      const [row] = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "_PoolMembers" WHERE "B" = ${pool.id}`;
      return { count: row?.n ?? 0, capped: false };
    }
  }
  return boundedContactCount(contactsWhere(orgId, input, pool), cap);
}
