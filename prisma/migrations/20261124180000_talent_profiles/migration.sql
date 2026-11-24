ALTER TABLE "Contact" ADD COLUMN "careerProfile" JSONB;
ALTER TABLE "Contact" ADD COLUMN "salaryExpectation" INTEGER;
ALTER TABLE "StoredFile" ADD COLUMN "resumeVersion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoredFile" ADD COLUMN "resumeContent" TEXT;
ALTER TABLE "StoredFile" ADD COLUMN "uploadedById" TEXT;
CREATE INDEX "StoredFile_contactId_resumeVersion_idx" ON "StoredFile"("contactId", "resumeVersion");

UPDATE "StoredFile" f SET "resumeVersion" = true
WHERE EXISTS (SELECT 1 FROM "Contact" c WHERE c."resumeFileId" = f.id AND c."orgId" = f."orgId")
   OR EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."applicationResumeId" = f.id AND o."orgId" = f."orgId");

UPDATE "StoredFile" f SET "resumeContent" = c."resumeText"
FROM "Contact" c
WHERE c."resumeFileId" = f.id AND c."orgId" = f."orgId" AND c."resumeText" IS NOT NULL
  AND NOT c."isAnonymized" AND f."deletePendingAt" IS NULL AND (f."contactId" IS NULL OR f."contactId" = c.id);
