CREATE TABLE "TalentSummary" (
  "contactId" TEXT PRIMARY KEY REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "orgId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "headline" TEXT,
  "content" JSONB,
  "searchText" TEXT,
  "sourceKind" TEXT,
  "sourceFileId" TEXT,
  "inputHash" TEXT,
  "requestedHash" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" TEXT,
  "tokens" INTEGER,
  "generatedAt" TIMESTAMP(3),
  "reviewedText" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "errorCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TalentSummary_orgId_status_priority_availableAt_idx" ON "TalentSummary"("orgId","status","priority","availableAt");
CREATE INDEX "TalentSummary_search_trgm_idx" ON "TalentSummary" USING GIN (public.rga_fold("searchText") gin_trgm_ops);

CREATE TABLE "TalentSyncRun" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "requestedById" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "rowsRead" INTEGER NOT NULL DEFAULT 0,
  "unresolved" INTEGER NOT NULL DEFAULT 0,
  "remaining" INTEGER NOT NULL DEFAULT 0,
  "unchanged" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicates" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "summaries" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT
);
CREATE INDEX "TalentSyncRun_orgId_createdAt_idx" ON "TalentSyncRun"("orgId","createdAt");
CREATE INDEX "TalentSyncRun_orgId_status_availableAt_idx" ON "TalentSyncRun"("orgId","status","availableAt");
