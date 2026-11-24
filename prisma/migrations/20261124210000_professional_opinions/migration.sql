ALTER TABLE "Organization" ADD COLUMN "opinionTemplate" JSONB;
ALTER TABLE "RecruitingAssessment" ADD COLUMN "opinionDraftAt" TIMESTAMP(3), ADD COLUMN "clientFeedback" JSONB;
CREATE TABLE "ProfessionalOpinionVersion" (
  "opportunityId" TEXT NOT NULL REFERENCES "RecruitingAssessment"("opportunityId") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "authorId" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("opportunityId", "version")
);
INSERT INTO "ProfessionalOpinionVersion" ("opportunityId","version","content","authorId","issuedAt")
SELECT "opportunityId", 1, "opinion", "opinionAuthorId", "opinionFinalizedAt"
FROM "RecruitingAssessment" WHERE "opinion" IS NOT NULL AND "opinionFinalizedAt" IS NOT NULL;
