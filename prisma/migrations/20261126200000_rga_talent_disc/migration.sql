CREATE TABLE "TalentDisc" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL,
  "instrument" TEXT NOT NULL,
  "authorization" TEXT NOT NULL,
  "externalUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "validUntil" DATE,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentDisc_status_check" CHECK ("status" IN ('PENDING','SENT','COMPLETED','CANCELLED'))
);
CREATE INDEX "TalentDisc_orgId_contactId_createdAt_idx" ON "TalentDisc" ("orgId", "contactId", "createdAt");
CREATE INDEX "TalentDisc_orgId_status_idx" ON "TalentDisc" ("orgId", "status");
