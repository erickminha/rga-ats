CREATE TYPE "ArchiveCategory" AS ENUM ('REJECTION', 'WITHDRAWAL', 'ADMINISTRATIVE');
ALTER TABLE "ArchiveReason" ADD COLUMN "category" "ArchiveCategory";
ALTER TABLE "Opportunity" ADD COLUMN "hiredAt" DATE;
