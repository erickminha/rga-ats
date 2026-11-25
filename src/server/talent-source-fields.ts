import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';

/** One bounded projection; never return raw snapshots, identifiers from the spreadsheet, or other organizations. */
export async function talentSourceFields(orgId: string, ids: string[]) {
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
  return sourceById;
}
