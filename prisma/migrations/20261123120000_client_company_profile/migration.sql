ALTER TABLE "ClientCompany"
ADD COLUMN "legalName" TEXT,
ADD COLUMN "cnpj" TEXT,
ADD COLUMN "stateRegistration" TEXT,
ADD COLUMN "segment" TEXT,
ADD COLUMN "size" TEXT,
ADD COLUMN "responsibleName" TEXT,
ADD COLUMN "responsibleRole" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "whatsapp" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "createdAt" TIMESTAMP(3);

-- The original model did not record a creation date. Keep it unknown for legacy rows.
ALTER TABLE "ClientCompany" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ClientCompanyContact" (
  "id" TEXT NOT NULL,
  "clientCompanyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  CONSTRAINT "ClientCompanyContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientCompanyContact_clientCompanyId_fkey"
    FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClientCompany_orgId_cnpj_key" ON "ClientCompany"("orgId", "cnpj");
CREATE UNIQUE INDEX "ClientCompany_orgId_externalSource_externalId_key"
  ON "ClientCompany"("orgId", "externalSource", "externalId");
CREATE INDEX "ClientCompany_orgId_active_segment_idx" ON "ClientCompany"("orgId", "active", "segment");
CREATE INDEX "ClientCompanyContact_clientCompanyId_idx" ON "ClientCompanyContact"("clientCompanyId");
CREATE INDEX "Posting_orgId_clientCompanyId_idx" ON "Posting"("orgId", "clientCompanyId");
