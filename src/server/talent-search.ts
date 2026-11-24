import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { pickTalentFilters, type TalentFilters } from '@/lib/talent-search';
import { parseSalary, phoneDigits } from '@/lib/talent-profile';
import { likePattern } from '@/server/lists/pipeline';
import { TalentProfileError } from '@/server/talent-profile';

const ARCHIVE = 'PROFILE_STORAGE';
const limit = 30;

const hasResume = Prisma.sql`EXISTS (SELECT 1 FROM "StoredFile" f
  WHERE f."orgId" = c."orgId" AND f."deletePendingAt" IS NULL
    AND (f.id = c."resumeFileId" OR (f."contactId" = c.id AND f."resumeVersion")))`;
const hasHistory = Prisma.sql`EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."orgId" = c."orgId" AND o."contactId" = c.id)`;
const hasActive = Prisma.sql`EXISTS (SELECT 1 FROM "Opportunity" o
  WHERE o."orgId" = c."orgId" AND o."contactId" = c.id AND o.status = 'ACTIVE' AND o."postingId" IS NOT NULL)`;
const hasConsent = Prisma.sql`EXISTS (SELECT 1 FROM "ConsentRecord" g
  WHERE g."orgId" = c."orgId" AND g."contactId" = c.id AND g.purpose::text = ${ARCHIVE})`;
const eligible = Prisma.sql`(NOT c."retentionHold" AND EXISTS (
  SELECT 1 FROM "ConsentRecord" g WHERE g."orgId" = c."orgId" AND g."contactId" = c.id
    AND g.purpose::text = ${ARCHIVE} AND g."withdrawnAt" IS NULL
))`;

function textMatch(expression: Prisma.Sql, value: string) {
  return Prisma.sql`public.rga_fold(${expression}) LIKE public.rga_fold(${likePattern(value)}) ESCAPE '\\'`;
}

function predicate(f: TalentFilters) {
  const parts: Prisma.Sql[] = [];
  if (f.q) {
    const pattern = likePattern(f.q);
    const digits = phoneDigits(f.q);
    const matchPhone = /^[0-9+().\s-]+$/.test(f.q) && digits.length >= 5
      ? Prisma.sql`OR EXISTS (SELECT 1 FROM unnest(c.phones || ARRAY[coalesce(c."careerProfile"->>'whatsapp','')]) p
        WHERE regexp_replace(p, '[^0-9]', '', 'g') LIKE ${`%${digits}%`})`
      : Prisma.empty;
    parts.push(Prisma.sql`(
      public.rga_talent_text(c.name, c.headline, c.location, c.emails, c.phones, c.tags, c."careerProfile")
        LIKE public.rga_fold(${pattern}) ESCAPE '\\'
      OR (c."resumeText" IS NOT NULL AND ${textMatch(Prisma.sql`c."resumeText"`, f.q)})
      OR EXISTS (SELECT 1 FROM "StoredFile" f WHERE f."contactId" = c.id AND f."orgId" = c."orgId"
       AND f."resumeVersion" AND f."deletePendingAt" IS NULL AND f."resumeContent" IS NOT NULL
       AND public.rga_fold(f."resumeContent") LIKE public.rga_fold(${pattern}) ESCAPE '\\')
      ${matchPhone}
    )`);
  }
  if (f.city) parts.push(textMatch(Prisma.sql`c.location`, f.city));
  if (f.state) parts.push(Prisma.sql`c."careerProfile"->>'state' = ${f.state}`);
  if (f.area) parts.push(textMatch(Prisma.sql`c.headline`, f.area));
  if (f.skill) parts.push(textMatch(Prisma.sql`c."careerProfile"->>'skills'`, f.skill));
  if (f.salary === 'UNKNOWN' || f.salary === 'Não informado') parts.push(Prisma.sql`c."salaryExpectation" IS NULL`);
  else if (f.salary) {
    try { parts.push(Prisma.sql`c."salaryExpectation" <= ${parseSalary(f.salary)}`); }
    catch { throw new TalentProfileError('Informe o limite salarial em reais. Ex.: 3.500,00.'); }
  }
  if (f.availability === 'UNKNOWN') parts.push(Prisma.sql`coalesce(c."careerProfile"->>'availability','') = ''`);
  else if (f.availability) parts.push(Prisma.sql`c."careerProfile"->>'availability' = ${f.availability}`);
  if (f.tag) parts.push(Prisma.sql`EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE public.rga_fold(t) = public.rga_fold(${f.tag}))`);
  if (f.resume === 'YES' || f.resume === 'NO') parts.push(f.resume === 'YES' ? hasResume : Prisma.sql`NOT ${hasResume}`);
  if (f.history === 'YES' || f.history === 'NO') parts.push(f.history === 'YES' ? hasHistory : Prisma.sql`NOT ${hasHistory}`);
  if (f.active === 'YES' || f.active === 'NO') parts.push(f.active === 'YES' ? hasActive : Prisma.sql`NOT ${hasActive}`);
  if (f.updated === '30' || f.updated === '90') parts.push(Prisma.sql`c."updatedAt" >= ${new Date(Date.now() - Number(f.updated) * 86_400_000)}`);
  if (f.eligibility === 'YES') parts.push(eligible);
  if (f.eligibility === 'NO') parts.push(Prisma.sql`NOT ${eligible} AND (${hasConsent} OR c."retentionHold")`);
  if (f.eligibility === 'UNKNOWN') parts.push(Prisma.sql`NOT ${hasConsent} AND NOT c."retentionHold"`);
  return parts;
}

export async function searchTalents(ctx: SessionContext, filters: TalentFilters, { poolId, after }: { poolId?: string; after?: string } = {}) {
  requireRecruitingAccess(ctx);
  const where = [Prisma.sql`c."orgId" = ${ctx.orgId} AND NOT c."isAnonymized"`, ...predicate(filters)];
  let pool = null;
  if (poolId) {
    pool = await db.talentPool.findFirst({ where: { id: poolId, orgId: ctx.orgId } });
    if (!pool) throw new TalentProfileError('Grupo indisponível.');
    if (pool.kind === 'STATIC') where.push(Prisma.sql`EXISTS (SELECT 1 FROM "_PoolMembers" m WHERE m."A" = c.id AND m."B" = ${pool.id})`);
    else if (pool.rules && typeof pool.rules === 'object' && !Array.isArray(pool.rules)) {
      where.push(...predicate(pickTalentFilters(pool.rules)));
      if (typeof pool.rules.origin === 'string') where.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Opportunity" o WHERE o."contactId" = c.id AND o."orgId" = c."orgId" AND o.origin::text = ${pool.rules.origin}
      )`);
    }
  }
  if (after) {
    const cursor = await db.contact.findFirst({ where: { id: after, orgId: ctx.orgId, isAnonymized: false }, select: { updatedAt: true } });
    if (cursor) where.push(Prisma.sql`(c."updatedAt", c.id) < (${cursor.updatedAt}, ${after})`);
  }
  const rows = await db.$queryRaw<{ id: string; eligible: boolean; hasResume: boolean }[]>`
     SELECT c.id, ${eligible} AS eligible, ${hasResume} AS "hasResume"
     FROM "Contact" c WHERE ${Prisma.join(where, ' AND ')}
     ORDER BY c."updatedAt" DESC, c.id DESC LIMIT ${limit + 1}
  `;
  const selected = rows.slice(0, limit);
  const people = new Map((await db.contact.findMany({
    where: { orgId: ctx.orgId, isAnonymized: false, id: { in: selected.map(({ id }) => id) } },
    select: { id: true, name: true, headline: true, location: true, careerProfile: true, salaryExpectation: true, tags: true, resumeFileId: true, updatedAt: true },
  })).map((person) => [person.id, person]));
  return {
    pool,
    rows: selected.flatMap((row) => {
      const person = people.get(row.id);
      return person ? [{ ...person, eligible: row.eligible, hasResume: row.hasResume }] : [];
    }),
    next: rows.length > limit ? selected.at(-1)?.id : undefined,
  };
}

export async function talentIndicators(ctx: SessionContext) {
  requireRecruitingAccess(ctx);
  const scope = { orgId: ctx.orgId, isAnonymized: false };
  const [counts, areas, cities] = await Promise.all([
    db.$queryRaw<{ total: number; resumes: number; recent: number; active: number }[]>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE ${hasResume})::int AS resumes,
        count(*) FILTER (WHERE c."updatedAt" >= now() - interval '30 days')::int AS recent,
        count(*) FILTER (WHERE ${hasActive})::int AS active
      FROM "Contact" c WHERE c."orgId" = ${ctx.orgId} AND NOT c."isAnonymized"
    `,
    db.contact.groupBy({ by: ['headline'], where: { ...scope, headline: { not: null } }, _count: { headline: true },
      orderBy: [{ _count: { headline: 'desc' } }, { headline: 'asc' }], take: 6 }),
    db.contact.groupBy({ by: ['location'], where: { ...scope, location: { not: null } }, _count: { location: true },
      orderBy: [{ _count: { location: 'desc' } }, { location: 'asc' }], take: 6 }),
  ]);
  return { counts: counts[0], areas, cities };
}
