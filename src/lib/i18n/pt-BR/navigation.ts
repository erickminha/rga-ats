import { settings } from './settings';

export const navigation = {
  dashboard: 'Painel',
  search: 'Busca',
  review: 'Revisão',
  pipeline: 'Funil de recrutamento',
  contacts: 'Candidatos e talentos',
  referrals: 'Indicações',
  postings: 'Vagas',
  interviews: 'Entrevistas',
  tasks: 'Tarefas',
  newsletters: 'Comunicados',
  reports: 'Relatórios',
  settings: settings.title,
  more: 'Mais',
  moreOptions: 'Mais opções de navegação',
  main: 'Navegação principal',
  workspace: 'Espaço de trabalho',
  account: 'Conta',
  signOut: 'Sair da conta',
  searchShortcut: 'Abrir busca (Ctrl+K ou ⌘K)',
  loadingPage: (label: string) => `Carregando ${label}…`,
  loadingSubtitles: {
    contacts: 'Todas as pessoas da sua rede de talentos',
    interviews: 'Agenda, participantes e resultados',
    pipeline: 'Todos os candidatos ativos',
    postings: 'Crie, publique e divulgue vagas abertas',
    referrals: 'Indique pessoas e acompanhe o andamento no funil',
    reports: 'Funil, origens e resultados',
    review: 'Novas candidaturas avaliadas e classificadas conforme a vaga',
    search: 'Candidatos, currículos, notas, transcrições e vagas',
    tasks: 'Tarefas e candidatos adiados de toda a equipe',
  },
} as const;

export const appFeedback = {
  dismiss: 'Dispensar notificação',
  error: 'Algo deu errado',
  errorMessage: 'Não foi possível concluir a operação.',
  retry: 'Tentar novamente',
  retryHint: 'Se o problema persistir, consulte o registro de auditoria em Configurações para conferir o que foi concluído.',
} as const;

export const searchBox = {
  ask: 'Perguntar à IA',
  search: 'Buscar',
  label: 'Faça uma pergunta',
  placeholder: 'Busque candidatos, currículos, notas e vagas…',
  aiPlaceholder: 'Pergunte sobre seus candidatos ou busque uma pessoa…',
  pagePlaceholder: 'Descreva o perfil profissional que procura. Ex.: auxiliar administrativo no AM. Não inclua CPF, telefone ou dados pessoais.',
  searchFor: 'Buscar por',
  searchable: 'Nomes, currículos, notas e vagas',
  tryAsking: 'Sugestões de perguntas',
  thinkingLabel: 'Analisando…',
  thinking: [
    'Consultando registros autorizados…',
    'Buscando informações profissionais…',
    'Analisando as informações encontradas…',
    'Identificando os candidatos citados…',
  ],
  suggestions: [
    'Localize perfis de auxiliar administrativo no AM.',
    'Quais perfis informaram interesse em técnico em eletrônica?',
    'Procuro assistente contábil no RJ.',
  ],
  askHint: 'Enter para perguntar · Shift+Enter para nova linha · Esc para fechar',
  searchHint: 'Enter para buscar · Esc para fechar',
  sources: 'Fontes',
  sourceKinds: { transcript: 'Transcrição', resume: 'Currículo', note: 'Nota', profile: 'Perfil profissional' },
  fullerQuestion: 'Escreva uma pergunta mais completa.',
  failed: 'Não foi possível responder à pergunta. Tente novamente.',
} as const;

export function askError(message: string): string {
  return message === 'Ask a fuller question.' ? searchBox.fullerQuestion : searchBox.failed;
}
