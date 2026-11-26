-- Stable semantic role; existing IDs, names and transitions are preserved.
ALTER TABLE "Stage" ADD COLUMN "operationalRole" TEXT;
UPDATE "Stage" SET "operationalRole" = CASE
  WHEN lower("name") IN ('entrevista','entrevista presencial','on-site','onsite') THEN 'INTERVIEW'
  WHEN lower("name") IN ('finalistas','avaliação disc','parecer','apresentação ao cliente') THEN 'FINALIST'
  WHEN lower("name") IN ('verificação de referências','referências profissionais') THEN 'REFERENCES'
  ELSE NULL END;
