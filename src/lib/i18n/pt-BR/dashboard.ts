import type { ApprovalSubject } from '@prisma/client';
import { appLocale } from '..';

const number = new Intl.NumberFormat(appLocale);

export const dashboard = {
  greeting: (firstName: string) => firstName ? `Olá, ${firstName}!` : 'Olá!',
  workspaceLogo: 'Logotipo do espaço de trabalho',
  logo: (organization: string) => `Logotipo de ${organization}`,
  upcoming: (count: number) => `${number.format(count)} ${count === 1 ? 'entrevista agendada' : 'entrevistas agendadas'}`,
  candidateCount: (count: number) => `${number.format(count)} ${count === 1 ? 'candidato na sua rede' : 'candidatos na sua rede'}`,
  searchPlaceholder: 'Candidatos, vagas, transcrições…',
  interview: {
    empty: 'Nenhuma entrevista ainda',
    emptyDescription: 'As entrevistas agendadas aparecem aqui por dia, com acesso aos materiais de cada entrevista.',
    general: 'Oportunidade geral',
    open: 'Ver entrevista',
    duration: (minutes: number) => `${number.format(minutes)} min`,
  },
  onboarding: {
    title: 'Primeiros passos',
    progress: 'Progresso dos primeiros passos',
    complete: (percent: number) => `${percent}% concluído`,
    description: 'Comece a usar o espaço de trabalho com estas etapas.',
    hide: 'Ocultar primeiros passos',
    completed: 'Concluído',
    posting: { label: 'Publique sua primeira vaga', detail: 'Crie um rascunho e publique na página de carreiras' },
    candidate: { label: 'Adicione um candidato', detail: 'Importe, receba uma candidatura ou cadastre a pessoa manualmente' },
    interview: { label: 'Agende uma entrevista', detail: 'Os convites incluem um arquivo de calendário' },
    transcript: { label: 'Anexe uma transcrição', detail: 'Cole o texto ou envie pelo Walkie ou Tactiq via API' },
    branding: { label: 'Personalize o espaço', detail: 'Envie seu logotipo' },
  },
  approvals: {
    title: 'Aguardando sua aprovação',
    approve: 'Aprovar',
    reject: 'Rejeitar',
    subjects: {
      POSTING: 'Vaga',
      OFFER: 'Proposta',
      REQUISITION: 'Requisição',
    } satisfies Record<ApprovalSubject, string>,
    adminOnly: 'Somente administradores podem decidir sobre aprovações.',
    notFound: 'Esta solicitação de aprovação já foi resolvida ou está indisponível.',
    failed: 'Não foi possível concluir a aprovação. Tente novamente.',
  },
  ai: {
    title: 'Consulte a base de talentos com IA',
    description: 'Faça perguntas sobre transcrições, currículos e notas. As respostas indicam os candidatos citados.',
    open: 'Abrir consulta com IA',
  },
} as const;

export function approvalError(message: string): string {
  if (message === 'Admins only.') return dashboard.approvals.adminOnly;
  if (message === 'Approval request not found') return dashboard.approvals.notFound;
  return dashboard.approvals.failed;
}
