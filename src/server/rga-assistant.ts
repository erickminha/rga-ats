import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { reserveRequest } from '@/server/request-limit';
import { assistantChat, assistantFailureCode, assistantLimits, assistantProvider } from '@/server/assistant-provider';
import type { CorpusAnswer } from '@/server/ai';

import { parseProfileSearch } from '@/lib/assistant-search';
async function reserve(orgId: string) {
  const {daily,monthly} = assistantLimits();
  const day = new Date().toISOString().slice(0,10);
  if (!daily || !monthly) return false;
  return await reserveRequest('rga-assistant-global-day',[day],daily,86400000)
    && await reserveRequest('rga-assistant-global-month',[day.slice(0,7)],monthly,31*86400000)
    && await reserveRequest('rga-assistant-org-day',[orgId,day],daily,86400000);
}
async function log(ctx: SessionContext, success: boolean, tokens: number | null, count: number, test = false, failure: string | null = null, execution?: 'local') {
  const config = execution === 'local' ? null : assistantProvider();
  await db.$transaction(async tx => {
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: test ? 'assistant.tested' : 'assistant.queried',
      subjectType: 'organization', subjectId: ctx.orgId,
      payload: { success, provider: config?.provider ?? 'local', model: config?.model ?? null, tokens, count, failure } });
  });
}
// Operational queries never leave the ATS or reserve provider credits.
export function operationalIntent(question: string): 'open_list' | 'open_count' | 'contacts_count' | null {
  const text = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[?!.,:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:me mostre|mostre|liste|listar|quais sao|quais|exiba|ver) (?:as )?(?:nossas )?vagas (?:abertas|ativas|em andamento)(?: (?:atualmente|hoje))?$/.test(text) ||
      /^vagas (?:abertas|ativas|em andamento)$/.test(text)) return 'open_list';
  if (/^(?:quantas vagas (?:abertas|ativas|em andamento)(?: temos| existem)?|quantas vagas temos (?:abertas|ativas|em andamento)|quantidade de vagas (?:abertas|ativas|em andamento))(?: (?:atualmente|hoje))?$/.test(text)) return 'open_count';
  if (/^(?:quantos (?:candidatos|profissionais|talentos)(?: cadastrados)? (?:temos|existem|estao cadastrados)|quantos (?:candidatos|profissionais|talentos) temos cadastrados|quantidade de (?:candidatos|profissionais|talentos) cadastrados)$/.test(text)) return 'contacts_count';
  return null;
}

export async function askOperationalQuestion(ctx: SessionContext, question: string): Promise<CorpusAnswer | null> {
  requireRecruitingAccess(ctx);
  const intent = operationalIntent(question);
  if (!intent) return null;
  if (intent === 'contacts_count') {
    const count = await db.contact.count({ where: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false,
      opportunities: { none: { orgId: ctx.orgId, confidential: true } } } });
    return { answer: 'Total de profissionais cadastrados (sem anonimização, bloqueio de retenção ou participação confidencial): ' + count.toLocaleString('pt-BR') + '.', sources: [] };
  }
  const where: Prisma.PostingWhereInput = { orgId: ctx.orgId, state: { in: ['PUBLISHED', 'INTERNAL'] } };
  if (intent === 'open_count') {
    const count = await db.posting.count({ where });
    return { answer: count.toLocaleString('pt-BR') + ' vaga(s) aberta(s), publicadas ou internas. Rascunhos, aguardando aprovação e encerradas não estão incluídas.', sources: [] };
  }
  const [count, rows] = await db.$transaction([
    db.posting.count({ where }),
    db.posting.findMany({ where, orderBy: [{ title: 'asc' }, { id: 'asc' }], take: 100, select: { title: true, location: true, state: true } }),
  ]);
  const lines = rows.map((row, i) => (i + 1) + '. ' + row.title + (row.location ? ' — ' + row.location : '') + (row.state === 'INTERNAL' ? ' (interna)' : ' (publicada)'));
  return { answer: count ? count.toLocaleString('pt-BR') + ' vaga(s) aberta(s).\n\n' + lines.join('\n') + (count > rows.length ? '\n\nExibindo as primeiras 100; consulte a página de vagas para todas.' : '') : 'Nenhuma vaga publicada ou interna está aberta no momento.', sources: [] };
}

export async function askProfessionalProfiles(ctx: SessionContext, question: string): Promise<CorpusAnswer> {
  requireRecruitingAccess(ctx);
  if (/\b(?:cpf|rg|religiao|religião|etnia|raça|raca|gestante|gravida|grávida|estado civil|filhos|orientacao sexual|orientação sexual|idade)\b/i.test(question)) return { answer: 'Use apenas critérios profissionais pertinentes à vaga, como cargo, área e UF. Não pesquise atributos pessoais ou sensíveis.', sources: [] };
  const { roles, uf } = parseProfileSearch(question);
  if (!roles.length && !uf.length) return { answer: 'Informe um cargo, área profissional ou UF para localizar perfis. Ex.: auxiliar administrativo, técnico em eletrônica, Amazonas.', sources: [] };
  type Match = { title: string; snippet: string };
  const patterns = roles.map(term => '\\m' + term.replace(' ', '[[:space:]]+') + '\\M');
  const rows = await db.$queryRaw<{ id: string; name: string; uf: string | null; matches: Match[] }[]>`
    SELECT c.id, c.name, c."careerProfile"->>'state' AS uf, evidence.matches
    FROM "Contact" c
    LEFT JOIN "TalentSummary" summary ON summary."contactId" = c.id AND summary."orgId" = c."orgId"
    LEFT JOIN "TalentCvText" cv ON cv."contactId" = c.id AND cv."orgId" = c."orgId"
    CROSS JOIN LATERAL (
      WITH fields AS MATERIALIZED (
        SELECT * FROM (VALUES
          ('Cargo ou área de interesse', 1, c.headline),
          ('Experiência informada no cadastro', 4, c."careerProfile"->>'experience'),
          ('Competências informadas no cadastro', 3, c."careerProfile"->>'skills'),
          ('Formação informada no cadastro', 3, c."careerProfile"->>'education')
        ) AS f(title, priority, snippet)
        WHERE nullif(btrim(snippet), '') IS NOT NULL
        UNION ALL
        SELECT f.title, f.priority, item.snippet
        FROM (VALUES
          ('Histórico no resumo profissional', 4, summary.content->'experience'),
          ('Competências no resumo profissional', 3, summary.content->'skills'),
          ('Formação no resumo profissional', 3, summary.content->'education'),
          ('Cursos e certificações no resumo profissional', 3, summary.content->'courses'),
          ('Cargo pretendido no resumo profissional', 1, summary.content->'interest')
        ) AS f(title, priority, items)
        CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(f.items) = 'array' THEN f.items ELSE '[]'::jsonb END) AS item(snippet)
        UNION ALL
        SELECT CASE
          WHEN folded ~ '(^|[[:space:]])(objetivo|pretendo|interesse|busco|procuro|desejo|almejo|em busca)' THEN 'Interesse declarado no currículo'
          WHEN folded !~ '(^|[[:space:]])(sem experiencia|nao (tenho|possuo|trabalhei|atuei))'
           AND folded ~ '(^|[[:space:]])(experiencia|atuacao|atuei|trabalhei|responsavel|realizei|atividades)' THEN 'Experiência descrita no currículo'
          ELSE 'Menção no currículo'
        END,
        CASE
          WHEN folded ~ '(^|[[:space:]])(objetivo|pretendo|interesse|busco|procuro|desejo|almejo|em busca)' THEN 1
          WHEN folded !~ '(^|[[:space:]])(sem experiencia|nao (tenho|possuo|trabalhei|atuei))'
           AND folded ~ '(^|[[:space:]])(experiencia|atuacao|atuei|trabalhei|responsavel|realizei|atividades)' THEN 5
          ELSE 2
        END, line
        FROM regexp_split_to_table(CASE WHEN public.rga_fold(cv.text) ~ ANY(${patterns}::text[]) THEN cv.text END, '[[:cntrl:]]+') AS cv_line(line)
        CROSS JOIN LATERAL (SELECT public.rga_fold(line) AS folded) norm
      ), hits AS (
        SELECT term.position, term.pattern, match.title, match.priority, match.snippet
        FROM unnest(${patterns}::text[]) WITH ORDINALITY AS term(pattern, position)
        CROSS JOIN LATERAL (
          SELECT title, priority, snippet FROM fields
          WHERE public.rga_fold(snippet) ~ term.pattern
          ORDER BY priority DESC, length(snippet), title, snippet LIMIT 1
        ) match
      )
      SELECT count(*)::int AS found, coalesce(sum(priority), 0) AS score,
        coalesce(jsonb_agg(jsonb_build_object('title', title, 'snippet',
          btrim(substring(snippet FROM greatest(1, coalesce(strpos(public.rga_fold(snippet),
            substring(public.rga_fold(snippet) FROM pattern)), 1) - 90) FOR 260))) ORDER BY position), '[]'::jsonb) AS matches
      FROM hits
    ) evidence
    WHERE c."orgId" = ${ctx.orgId} AND NOT c."isAnonymized" AND NOT c."retentionHold"
      AND EXISTS (SELECT 1 FROM "ConsentRecord" g WHERE g."orgId" = c."orgId" AND g."contactId" = c.id AND g.purpose = 'PROFILE_STORAGE' AND g."withdrawnAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."orgId" = c."orgId" AND o."contactId" = c.id AND o.confidential)
      ${uf.length ? Prisma.sql`AND c."careerProfile"->>'state' = ANY(${uf}::text[])` : Prisma.empty}
      AND evidence.found = ${roles.length}
    ORDER BY evidence.score DESC, c."createdAt" DESC, c.id DESC LIMIT 12
  `;
  const sources: CorpusAnswer['sources'] = rows.map(row => {
    const matches = [...new Map(row.matches.map(hit => [JSON.stringify(hit), hit])).values()];
    return { kind: 'profile', contactName: row.name, contactId: row.id, opportunityId: null,
      title: row.uf ? 'Perfil profissional · ' + row.uf : 'Perfil profissional',
      snippet: matches.map(hit => hit.title + ': ' + hit.snippet).join(' · ') || 'UF cadastrada: ' + row.uf };
  });
  await log(ctx, true, null, rows.length, false, null, 'local');
  return {
    answer: rows.length ? 'Perfis com os termos pesquisados (até 12). Os trechos indicam a origem de cada informação. Confira na ficha os relatos de experiência e o contexto das menções.' :
      'Nenhum perfil autorizado correspondeu aos termos e à UF pesquisados.',
    sources,
  };
}
export async function testAssistant(ctx: SessionContext) {
  if (!isAdmin(ctx)) return {ok:false, code:'not_configured'};
  if (!assistantProvider()) return {ok:false, code:'not_configured'};
  if (!await reserveRequest('rga-assistant-test',[ctx.orgId],3,3600000) || !await reserve(ctx.orgId)) return {ok:false, code:'limit'};
  try {
    const result = await assistantChat('Qual perfil informou interesse em auxiliar administrativo?', [{n:1,professional:'Cargo informado: auxiliar administrativo. UF: AM.'}]);
    await log(ctx,true,result.tokens,1,true); return {ok:true, code:null};
  } catch (error) { const code = assistantFailureCode(error); await log(ctx,false,null,1,true,code).catch(() => {}); console.warn('[assistant] test failure:',code); return {ok:false,code}; }
}
