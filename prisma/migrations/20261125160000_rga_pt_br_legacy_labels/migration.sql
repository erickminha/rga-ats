-- Translate only known inherited labels in the RGA workspace.
-- Preserve stage IDs, order, type, candidate links and historical events.
WITH mapping(old_name, new_name, stage_type) AS (VALUES
  ('New lead', 'Novo talento', 'LEAD'),
  ('Reached out', 'Contato realizado', 'LEAD'),
  ('Responded', 'Respondeu', 'LEAD'),
  ('New applicant', 'Nova candidatura', 'APPLICANT'),
  ('Phone screen', 'Triagem por telefone', 'SCREEN'),
  ('On-site', 'Entrevista presencial', 'ONSITE'),
  ('Offer', 'Proposta', 'OFFER'),
  ('Hired', 'Contratado', 'HIRED')
), updated AS (
  UPDATE "Stage" s SET name = m.new_name
  FROM mapping m, "Organization" o
  WHERE s."orgId" = o.id AND o.slug = 'rga-consultoria-de-rh'
    AND s.name = m.old_name AND s.type::text = m.stage_type
    AND NOT EXISTS (SELECT 1 FROM "Stage" other WHERE other."orgId" = s."orgId"
      AND lower(other.name) = lower(m.new_name) AND other.id <> s.id)
  RETURNING s.id, s."orgId", m.old_name, m.new_name
)
INSERT INTO "Event" (id, "orgId", "actorType", verb, "subjectType", "subjectId", payload, "occurredAt")
SELECT gen_random_uuid()::text, "orgId", 'system', 'stage.renamed', 'stage', id,
  jsonb_build_object('from', old_name, 'to', new_name, 'source', 'rga_pt_br_legacy_labels'), CURRENT_TIMESTAMP
FROM updated;

-- Use the same inherited-reason mapping as the existing RGA settings action.
WITH mapping(old_name, new_name, category, rejection) AS (VALUES
  ('Underqualified', 'Não atende aos requisitos da vaga', 'REJECTION', true),
  ('Culture / values mismatch', 'Incompatibilidade com a proposta', 'REJECTION', true),
  ('Timing', 'Encerramento por prazo', 'ADMINISTRATIVE', false),
  ('Withdrew', 'Solicitou retirada do processo', 'WITHDRAWAL', false),
  ('Offer declined', 'Recusou a proposta', 'WITHDRAWAL', false),
  ('Position filled', 'Vaga preenchida', 'ADMINISTRATIVE', false)
), updated AS (
  UPDATE "ArchiveReason" a SET name = m.new_name, category = m.category::"ArchiveCategory"
  FROM mapping m, "Organization" o
  WHERE a."orgId" = o.id AND o.slug = 'rga-consultoria-de-rh'
    AND a.name = m.old_name AND a.category IS NULL AND a."countsAsRejection" = m.rejection
    AND NOT EXISTS (SELECT 1 FROM "ArchiveReason" other WHERE other."orgId" = a."orgId"
      AND lower(other.name) = lower(m.new_name) AND other.id <> a.id)
  RETURNING a.id, a."orgId", m.old_name, m.new_name
)
INSERT INTO "Event" (id, "orgId", "actorType", verb, "subjectType", "subjectId", payload, "occurredAt")
SELECT gen_random_uuid()::text, "orgId", 'system', 'archive_reason.renamed', 'archive_reason', id,
  jsonb_build_object('from', old_name, 'to', new_name, 'source', 'rga_pt_br_legacy_labels'), CURRENT_TIMESTAMP
FROM updated;
