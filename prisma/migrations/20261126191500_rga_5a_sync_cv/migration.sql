BEGIN;

ALTER TABLE "TalentSyncRun"
  ADD COLUMN "nextSheetRow" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "sourceEndRow" INTEGER,
  ADD COLUMN "sourceHash" TEXT,
  ADD COLUMN "cvImported" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reviewDetails" JSONB;

CREATE TABLE "TalentCvText" (
  "contactId" TEXT PRIMARY KEY REFERENCES "Contact"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "orgId" TEXT NOT NULL,
  text TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TalentCvText_orgId_contactId_idx" ON "TalentCvText" ("orgId", "contactId");

INSERT INTO "TalentCvText" ("contactId", "orgId", text, "inputHash", "updatedAt")
SELECT t."contactId", t."orgId", t.content->>'cvText', COALESCE(t.content->>'cvHash', ''), t."updatedAt"
FROM "TalentSummary" t
JOIN "Contact" c ON c.id = t."contactId" AND c."orgId" = t."orgId"
WHERE jsonb_typeof(t.content->'cvText') = 'string'
  AND length(btrim(t.content->>'cvText')) > 0
  AND NOT c."isAnonymized"
  AND EXISTS (
    SELECT 1 FROM "ConsentRecord" g WHERE g."contactId" = c.id AND g."orgId" = c."orgId"
      AND g.purpose = 'PROFILE_STORAGE' AND g."withdrawnAt" IS NULL
  );

-- PR #36 created summary placeholders when only OCR was available.
DELETE FROM "TalentSummary" WHERE "promptVersion" = 'rga-sheet-cv-v1'
  AND headline IS NULL AND "reviewedText" IS NULL AND "searchText" IS NULL
  AND content - 'cvText' - 'cvHash' = '{}'::jsonb;
UPDATE "TalentSummary" SET content = content - 'cvText' - 'cvHash'
WHERE jsonb_typeof(content) = 'object' AND (content ? 'cvText' OR content ? 'cvHash');

-- Preserve the historical counters and let the next request start a paged run.
UPDATE "TalentSyncRun"
SET status = 'FAILED', "errorCode" = 'checkpoint_version', "finishedAt" = now()
WHERE status IN ('RUNNING', 'QUEUED') AND "rowsRead" > 0;

COMMIT;
