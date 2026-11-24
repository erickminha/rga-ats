CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- The application's dictionary stays fixed. Use the same function in queries and indexes.
CREATE FUNCTION public.rga_fold(value text) RETURNS text
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, value)) $$;

CREATE FUNCTION public.rga_talent_text(
  name text, headline text, location text, emails text[], phones text[], tags text[], career jsonb
) RETURNS text
LANGUAGE SQL IMMUTABLE PARALLEL SAFE
AS $$
  SELECT public.rga_fold(concat_ws(' ', name, headline, location, array_to_string(emails, ' '),
    array_to_string(phones, ' '), array_to_string(tags, ' '),
    career->>'state', career->>'education', career->>'skills', career->>'experience', career->>'whatsapp'))
$$;

CREATE INDEX "Contact_talent_text_trgm_idx" ON "Contact" USING GIN
  (public.rga_talent_text(name, headline, location, emails, phones, tags, "careerProfile") gin_trgm_ops)
  WHERE NOT "isAnonymized";
CREATE INDEX "Contact_talent_resume_trgm_idx" ON "Contact" USING GIN
  (public.rga_fold("resumeText") gin_trgm_ops)
  WHERE NOT "isAnonymized" AND "resumeText" IS NOT NULL;
CREATE INDEX "StoredFile_talent_resume_trgm_idx" ON "StoredFile" USING GIN
  (public.rga_fold("resumeContent") gin_trgm_ops)
  WHERE "resumeVersion" AND "deletePendingAt" IS NULL AND "resumeContent" IS NOT NULL;
CREATE INDEX "Contact_talent_recent_idx" ON "Contact" ("orgId","updatedAt" DESC, id DESC)
  WHERE NOT "isAnonymized";
