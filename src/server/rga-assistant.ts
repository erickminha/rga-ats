import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { reserveRequest } from '@/server/request-limit';
import { assistantChat, assistantFailureCode, assistantFailureMessage, assistantLimits, assistantProvider } from '@/server/assistant-provider';
import { likePattern } from '@/server/lists/pipeline';
import { statesBR } from '@/lib/talent-profile';
import type { CorpusAnswer } from '@/server/ai';

import { parseProfileSearch } from '@/lib/assistant-search';
export function profileTerms(question: string) { const parsed = parseProfileSearch(question); return [...parsed.roles,...parsed.uf.map(x=>x.toLowerCase())]; }
// Defense in depth: only the professional headline and UF are projected to the model.
// Do not transfer resumes, notes, names, contact channels or other profile fields.
export function scrubAssistantText(text: string) {
  return text.replace(/https?:\/\/\S+/gi,'[link omitido]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[contato omitido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[documento omitido]')
    .replace(/(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g,'[contato omitido]')
    .replace(/\b\d{7,}\b/g,'[número omitido]');
}
async function reserve(orgId: string) {
  const {daily,monthly} = assistantLimits();
  const day = new Date().toISOString().slice(0,10);
  if (!daily || !monthly) return false;
  return await reserveRequest('rga-assistant-global-day',[day],daily,86400000)
    && await reserveRequest('rga-assistant-global-month',[day.slice(0,7)],monthly,31*86400000)
    && await reserveRequest('rga-assistant-org-day',[orgId,day],daily,86400000);
}
async function log(ctx: SessionContext, success: boolean, tokens: number | null, count: number, test = false, failure: string | null = null) {
  const config = assistantProvider();
  await db.$transaction(async tx => {
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: test ? 'assistant.tested' : 'assistant.queried',
      subjectType: 'organization', subjectId: ctx.orgId,
      payload: { success, provider: config?.provider ?? 'local', model: config?.model ?? null, tokens, count, failure } });
  });
}
export async function askProfessionalProfiles(ctx: SessionContext, question: string): Promise<CorpusAnswer> {
  requireRecruitingAccess(ctx);
  if (/\b(?:cpf|rg|religiao|religião|etnia|raça|raca|gestante|gravida|grávida|estado civil|filhos|orientacao sexual|orientação sexual|idade)\b/i.test(question)) return { answer: 'Use apenas critérios profissionais pertinentes à vaga, como cargo, área e UF. Não pesquise atributos pessoais ou sensíveis.', sources: [] };
  const { roles, uf } = parseProfileSearch(question);
  if (!roles.length && !uf.length) return { answer: 'Informe um cargo, área profissional ou UF para localizar perfis. Ex.: auxiliar administrativo, técnico em eletrônica, Amazonas.', sources: [] };
  const hits = roles.length ? roles.map(term => Prisma.sql`(CASE WHEN public.rga_fold(c.headline) LIKE public.rga_fold(${likePattern(term)}) ESCAPE '\\' THEN 1 ELSE 0 END)`) : [Prisma.sql`1`];
  const score = Prisma.join(hits, ' + ');
  const rows = await db.$queryRaw<{ id: string; name: string; headline: string | null; uf: string | null; score: number }[]>`
    SELECT c.id,c.name,left(c.headline,300) AS headline,c."careerProfile"->>'state' AS uf,(${score})::int AS score
    FROM "Contact" c WHERE c."orgId"=${ctx.orgId} AND NOT c."isAnonymized" AND NOT c."retentionHold"
      AND EXISTS (SELECT 1 FROM "ConsentRecord" g WHERE g."orgId"=c."orgId" AND g."contactId"=c.id AND g.purpose='PROFILE_STORAGE' AND g."withdrawnAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."orgId"=c."orgId" AND o."contactId"=c.id AND o.confidential)
      ${uf.length ? Prisma.sql`AND c."careerProfile"->>'state' = ANY(${uf}::text[])` : Prisma.empty}
      AND (${score}) > 0
    ORDER BY score DESC,c."createdAt" DESC,c.id DESC LIMIT 12
  `;
  const professional = (row: typeof rows[number]) => ['Cargo ou área informada: ' + (row.headline || 'não informado'),statesBR.includes(row.uf ?? '') ? 'UF: ' + row.uf : ''].filter(Boolean).join(' · ');
  const sources: CorpusAnswer['sources'] = rows.map(row => ({ kind: 'profile', contactName: row.name, contactId: row.id, opportunityId: null, title: 'Perfil profissional', snippet: professional(row) }));
  if (!rows.length) return { answer: 'Não localizei perfis autorizados que correspondam aos termos pesquisados. Isso não significa que não existam profissionais com essa experiência. Tente outro cargo ou a busca avançada.', sources: [] };
  const local = (why: string) => ({ answer: why + '\n\nPerfis encontrados por correspondência de termos (até 12):\n' + rows.map((r,i) => '[' + (i+1) + '] ' + professional(r)).join('\n') + '\n\nCargo informado não comprova experiência. Confira os cadastros.', sources });
  if (!await reserve(ctx.orgId)) return local('Limite de consultas de IA atingido. Exibindo busca local.');
  try {
    const result = await assistantChat('Resuma os perfis encontrados pelos termos profissionais da busca local. Destaque apenas o que consta no cargo informado e na UF, sem inferir experiência.', rows.map((row,i) => ({
      n:i+1, professional: scrubAssistantText(row.name ? professional(row).replaceAll(row.name,'[nome omitido]') : professional(row)),
    })));
    await log(ctx,true,result.tokens,rows.length);
    return {answer: 'Busca assistida em até 12 perfis com cargo ou área e UF cadastrados. Não analisa currículos nesta etapa.\n\n' + result.answer, sources};
  } catch (error) { const code = assistantFailureCode(error); await log(ctx,false,null,rows.length,false,code).catch(() => {}); console.warn('[assistant] provider failure:',code); return local('IA indisponível no momento. ' + assistantFailureMessage(code) + ' Exibindo busca local.'); }
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
