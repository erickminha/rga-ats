ALTER TABLE "Opportunity" ADD COLUMN "applicationResumeId" TEXT;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_applicationResumeId_fkey"
  FOREIGN KEY ("applicationResumeId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Opportunity_applicationResumeId_idx" ON "Opportunity"("applicationResumeId");

ALTER TABLE "StoredFile" ADD COLUMN "deletePendingAt" TIMESTAMP(3);
CREATE INDEX "StoredFile_deletePendingAt_idx" ON "StoredFile"("deletePendingAt");

ALTER TABLE "EmailMessage" ADD COLUMN "deliveryClaimedAt" TIMESTAMP(3);
ALTER TABLE "ShareLink" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- Serialize creation/reactivation against the retention worker's contact lock,
-- including applications imported through existing writers.
CREATE FUNCTION protect_anonymized_contact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE erased boolean;
BEGIN
  IF NEW.status = 'ARCHIVED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."contactId" = NEW."contactId" AND OLD.status <> 'ARCHIVED' THEN RETURN NEW; END IF;
  END IF;
  SELECT "isAnonymized" INTO erased FROM "Contact" WHERE id = NEW."contactId" FOR NO KEY UPDATE;
  IF erased THEN
    RAISE EXCEPTION 'Cannot activate an anonymized candidate' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_anonymized_contact
  BEFORE INSERT OR UPDATE OF status, "contactId" ON "Opportunity"
  FOR EACH ROW EXECUTE FUNCTION protect_anonymized_contact();

ALTER TABLE "Contact" ADD COLUMN "retentionHold" BOOLEAN NOT NULL DEFAULT false;
