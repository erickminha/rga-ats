import type { ArchiveCategory } from '@prisma/client';

export const outcomeNames: Record<ArchiveCategory, string> = {
  REJECTION: 'Reprovação',
  WITHDRAWAL: 'Desistência',
  ADMINISTRATIVE: 'Encerramento administrativo',
};

export const outcomeCategory = (reason?: { category?: ArchiveCategory | null; countsAsRejection: boolean } | null) =>
  reason?.category ?? (reason?.countsAsRejection ? 'REJECTION' : 'ADMINISTRATIVE');

export const outcomeDefaults: Record<ArchiveCategory, string[]> = {
  REJECTION: ['Não atende aos requisitos da vaga', 'Experiência insuficiente', 'Incompatibilidade com a proposta', 'Desempenho insatisfatório na entrevista', 'Não selecionado pela empresa cliente', 'Outro motivo'],
  WITHDRAWAL: ['Aceitou outra proposta', 'Perdeu interesse na vaga', 'Incompatibilidade salarial', 'Incompatibilidade de horário ou localização', 'Não compareceu', 'Solicitou retirada do processo', 'Outro motivo'],
  ADMINISTRATIVE: ['Vaga cancelada', 'Vaga suspensa', 'Vaga preenchida', 'Candidatura duplicada', 'Outro motivo administrativo'],
};

export const dateBR = (date: Date, timeZone = 'America/Sao_Paulo') =>
  date.toLocaleDateString('pt-BR', { timeZone, dateStyle: 'short' });

export const dayBR = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short',
}).format(date);

export function isArchiveCategory(value: string): value is ArchiveCategory {
  return Object.hasOwn(outcomeNames, value);
}

export const inheritedReasons = [
  ['Underqualified', 'Não atende aos requisitos da vaga', 'REJECTION'],
  ['Culture / values mismatch', 'Incompatibilidade com a proposta', 'REJECTION'],
  ['Timing', 'Encerramento por prazo', 'ADMINISTRATIVE'],
  ['Withdrew', 'Solicitou retirada do processo', 'WITHDRAWAL'],
  ['Offer declined', 'Recusou a proposta', 'WITHDRAWAL'],
  ['Position filled', 'Vaga preenchida', 'ADMINISTRATIVE'],
] as const;

const legacyStageLabels: Record<string, string> = {
  'New lead': 'Novo talento', 'Reached out': 'Contato realizado', Responded: 'Respondeu',
  'New applicant': 'Nova candidatura', 'Phone screen': 'Triagem por telefone', 'On-site': 'Entrevista presencial',
  Offer: 'Proposta', Hired: 'Contratado',
};
export function displayStageName(name: unknown) {
  return typeof name === 'string' ? legacyStageLabels[name] ?? name : 'não informada';
}
export function displayArchiveReason(name: unknown) {
  if (typeof name !== 'string') return 'Sem informação';
  return inheritedReasons.find(([old]) => old === name)?.[1] ?? name;
}
