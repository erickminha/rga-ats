CREATE TABLE "NativeDisc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "createdById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "questionnaireVersion" TEXT NOT NULL,
    "scoringKey" JSONB,
    "simulation" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB,
    "results" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3)
);
CREATE INDEX "NativeDisc_opportunityId_createdAt_idx" ON "NativeDisc"("opportunityId", "createdAt");
