import { db } from '@/lib/db';
import { Badge, StatusDot } from '@/components/ui/primitives';
import {
  describeResumeParser,
  orgExcluded,
  resumeParseSummary,
  type ResumeParserDescription,
  type ResumeParseSummary,
} from '@/server/resume-parse';

/**
 * Settings → Integrations → Resume parsing: whether it's on, who reads the
 * resumes, what it did in the last 30 days, and what to fix. Every message
 * is fixed copy chosen by an error code; provider text is never shown.
 */

const DOCS = 'https://github.com/adamperlis/Source/blob/main/docs/resume-parsing.md';

const MISCONFIGURED: Record<NonNullable<ResumeParserDescription['reason']>, (d: ResumeParserDescription) => string> = {
  model_required: () => 'RESUME_PARSER_BASE_URL está configurada, mas falta o modelo. Configure RESUME_PARSER_MODEL, por exemplo gpt-oss:20b no Ollama.',
  bad_base_url: () => "RESUME_PARSER_BASE_URL não é um endereço HTTP ou HTTPS válido.",
  key_required: (d) => `${d.providerLabel ?? d.host ?? 'Este provedor'} precisa de uma chave de API. Configure RESUME_PARSER_API_KEY.`,
};

function hints(d: ResumeParserDescription, s: ResumeParseSummary): string[] {
  const provider = d.providerLabel ?? 'O provedor';
  const out: string[] = [];
  switch (s.pauseCode) {
    case 'provider_auth':
      out.push(`${provider} rejeitou a chave de API.`);
      break;
    case 'provider_not_found':
      out.push(`${provider} não reconhece o modelo ${d.model}.`);
      break;
    case 'provider_model_retired':
      out.push(`${provider} descontinuou o modelo ${d.model}. Configure RESUME_PARSER_MODEL com um modelo atual.`);
      break;
    case 'provider_quota':
      out.push(`${provider} informa que a conta está sem créditos ou excedeu sua cota. A análise dos currículos pendentes será retomada após a regularização.`);
      break;
    case 'provider_rate_limited':
      out.push(`${provider} está limitando as solicitações. Os currículos pendentes serão analisados após a renovação do limite.`);
      break;
    case 'provider_unavailable':
      out.push(`${provider} não está respondendo. Os currículos pendentes serão analisados quando o serviço retornar.`);
      break;
    case 'provider_timeout':
      out.push(`${provider} não está respondendo a tempo. A análise será retomada quando o serviço voltar. Se utilizar servidor próprio, aumente RESUME_PARSER_TIMEOUT_MS.`);
      break;
    case 'provider_bad_request':
      out.push(`${provider} está recusando solicitações para o modelo ${d.model}. Os currículos pendentes serão processados novamente; consulte a tabela de solução de problemas.`);
      break;
    case 'provider_redirect':
      out.push(`${provider} respondeu com um redirecionamento em vez de um resultado. Verifique RESUME_PARSER_BASE_URL.`);
      break;
  }
  switch (s.lastFileError) {
    case 'provider_too_large':
      out.push("Os currículos excedem o limite por solicitação do seu plano. Reduza RESUME_PARSER_MAX_CHARS.");
      break;
    case 'provider_timeout':
      out.push('O modelo demorou demais para responder. Se estiver em servidor próprio, aumente RESUME_PARSER_TIMEOUT_MS.');
      break;
    case null:
      break;
    default:
      out.push("Não foi possível aproveitar a resposta do modelo para alguns currículos. São realizadas até três tentativas para cada um.");
  }
  if (d.dailyLimit === 0) out.push('Análise pausada: RESUME_PARSER_DAILY_LIMIT está em 0.');
  else if (s.usedToday >= d.dailyLimit && s.waiting > 0) {
    out.push(`O limite diário de ${d.dailyLimit.toLocaleString('pt-BR')} currículos foi atingido. Os demais serão analisados amanhã (UTC).`);
  }
  return out;
}

function stats(s: ResumeParseSummary): string {
  const parts = [
    [s.last30.OK, 'lidos'],
    [s.last30.EMPTY, 'sem conteúdo aproveitável'],
    [s.last30.FAILED, 'com falha'],
    [s.last30.SKIPPED, 'ignorados'],
    [s.waiting, 'aguardando'],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${Number(n).toLocaleString('pt-BR')} ${label}`);
  return parts.length ? `Últimos 30 dias: ${parts.join(' · ')}` : 'Nenhum currículo lido até o momento.';
}

function Status({ tone, label }: { tone: 'positive' | 'neutral' | 'caution'; label: string }) {
  return <Badge tone={tone}>{label}</Badge>;
}

export async function ResumeParsingStatus({ orgId }: { orgId: string }) {
  const d = describeResumeParser();

  if (d.state === 'off') {
    return (
      <div className="flex flex-col items-start gap-3">
        <Status tone="neutral" label="Desativado" />
        <p className="max-w-prose text-sm text-ink-2">
          A análise preenche campos do perfil a partir do currículo quando um provedor autorizado está habilitado.
        </p>
        <a href={DOCS} target="_blank" rel="noreferrer" className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
          Configurar análise de currículos
        </a>
      </div>
    );
  }

  if (d.state === 'misconfigured') {
    return (
      <div className="flex flex-col items-start gap-3">
        <Status tone="caution" label="Inativo" />
        <p className="max-w-prose text-sm text-ink">{d.reason ? MISCONFIGURED[d.reason](d) : null}</p>
        <a href={DOCS} target="_blank" rel="noreferrer" className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
          Como configurar análise de currículos
        </a>
      </div>
    );
  }

  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, slug: true } });
  if (org && orgExcluded(org)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Status tone="neutral" label="Desativado neste espaço de trabalho" />
        <p className="max-w-prose text-sm text-ink-2">
          A análise de currículos está desabilitada. Os currículos de novas candidaturas ficam no ATS.
        </p>
      </div>
    );
  }

  const summary = await resumeParseSummary(orgId);
  const title = d.thirdParty ? `${d.providerLabel} · ${d.model}` : `Servidor próprio (${d.host}) · ${d.model}`;
  const destination = d.thirdParty
    ? `Para isso, o texto de cada currículo é enviado a ${d.providerLabel}.`
    : `O texto do currículo é enviado a ${d.host}, em sua própria rede. Nenhum dado vai a terceiros, a menos que esse servidor o encaminhe.`;
  const problems = hints(d, summary);

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Status tone={problems.length ? 'caution' : 'positive'} label="Ativado" />
        <p className="text-sm font-medium text-ink">{title}</p>
      </div>
      <p className="max-w-prose text-sm text-ink-2">
        A análise pode preencher título, localidade, telefone e links que estiverem vazios. Preserva os dados digitados e ignora currículos importados. {destination}
      </p>
      <p className="text-xs tabular-nums text-ink-2">{stats(summary)}</p>
      {problems.length ? (
        <ul className="flex flex-col gap-1.5">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-ink">
              <StatusDot tone="caution" className="mt-[7px]" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      <a href={DOCS} target="_blank" rel="noreferrer" className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink">
        Como funciona a análise de currículos
      </a>
    </div>
  );
}
