ALTER TABLE "Organization" ADD COLUMN "assessmentTemplates" JSONB;
ALTER TABLE "Posting" ADD COLUMN "competencyPlan" JSONB;
ALTER TABLE "RecruitingAssessment" ADD COLUMN "competencyInterview" JSONB;
