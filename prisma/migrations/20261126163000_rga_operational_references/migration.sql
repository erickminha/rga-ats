-- CreateEnum
CREATE TYPE "ProfessionalReferenceStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'WAITING_INFORMATION', 'WAITING_CONTACT', 'CONTACTED', 'WAITING_REPLY', 'VERIFIED', 'UNVERIFIABLE', 'WAIVED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "referenceQuestionnaire" JSONB;

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReferenceCheck" (
    "opportunityId" TEXT NOT NULL,
    "status" "ProfessionalReferenceStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceCheck_pkey" PRIMARY KEY ("opportunityId")
);

-- CreateTable
CREATE TABLE "ProfessionalReference" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "authorization" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answers" JSONB,

    CONSTRAINT "ProfessionalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceContactAttempt" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceContactAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingStageExclusion" (
    "postingId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,

    CONSTRAINT "PostingStageExclusion_pkey" PRIMARY KEY ("postingId","stageId")
);

-- CreateIndex
CREATE INDEX "ProfessionalReference_opportunityId_idx" ON "ProfessionalReference"("opportunityId");

-- CreateIndex
CREATE INDEX "ReferenceContactAttempt_referenceId_occurredAt_idx" ON "ReferenceContactAttempt"("referenceId", "occurredAt");

-- CreateIndex
CREATE INDEX "PostingStageExclusion_stageId_idx" ON "PostingStageExclusion"("stageId");

-- AddForeignKey
ALTER TABLE "ReferenceCheck" ADD CONSTRAINT "ReferenceCheck_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalReference" ADD CONSTRAINT "ProfessionalReference_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ReferenceCheck"("opportunityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceContactAttempt" ADD CONSTRAINT "ReferenceContactAttempt_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ProfessionalReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingStageExclusion" ADD CONSTRAINT "PostingStageExclusion_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingStageExclusion" ADD CONSTRAINT "PostingStageExclusion_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
