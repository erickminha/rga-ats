CREATE TABLE "RecruitingAssessment" (
  "opportunityId" TEXT NOT NULL PRIMARY KEY REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "screening" JSONB,
  "disc" JSONB,
  "discFileId" TEXT REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "opinion" JSONB,
  "opinionAuthorId" TEXT,
  "opinionFinalizedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RecruitingAssessment_discFileId_idx" ON "RecruitingAssessment"("discFileId");
ALTER TABLE "ShareLink" ADD COLUMN "selection" JSONB;
