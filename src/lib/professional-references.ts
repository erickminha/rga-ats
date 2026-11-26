export const referenceStatuses = {
  NOT_REQUESTED: 'Não solicitada',
  REQUESTED: 'Solicitada ao candidato',
  WAITING_INFORMATION: 'Aguardando informações',
  WAITING_CONTACT: 'Aguardando contato',
  CONTACTED: 'Contato realizado',
  WAITING_REPLY: 'Aguardando resposta',
  VERIFIED: 'Verificada',
  UNVERIFIABLE: 'Não foi possível verificar',
  WAIVED: 'Dispensada',
} as const;

export const referenceFields = {
  name: 'Nome', company: 'Empresa', role: 'Cargo', relationship: 'Relação profissional',
  period: 'Período de trabalho em conjunto', phone: 'Telefone', email: 'E-mail',
  channel: 'Canal preferencial', notes: 'Observações profissionais',
  authorization: 'Finalidade e autorização para contato',
};

export const referenceChannels = ['WhatsApp', 'Telefone', 'E-mail', 'Outro'];
export const referenceSources = {
  candidate: 'Declarada pelo candidato', thirdParty: 'Fornecida por terceiro',
  verified: 'Efetivamente verificada', unconfirmed: 'Informação não verificada',
  unknown: 'Não soube informar', inapplicable: 'Não se aplica',
} as const;

export const defaultReferenceQuestions = [
  'Confirmação do vínculo profissional', 'Cargo ou função exercida', 'Principais responsabilidades',
  'Qualidade das entregas', 'Cumprimento de prazos', 'Organização', 'Comunicação profissional',
  'Trabalho em equipe', 'Pontualidade', 'Responsabilidade', 'Possibilidade de nova contratação',
  'Observações adicionais',
];
export function referenceQuestions(value: unknown): string[] {
  return Array.isArray(value) && value.length && value.every(item => typeof item === 'string')
    ? value : defaultReferenceQuestions;
}

export type ReferenceAnswer = { question: string; source: keyof typeof referenceSources; text: string };

export function readReferenceAnswers(value: unknown): ReferenceAnswer[] {
  return Array.isArray(value) ? value as ReferenceAnswer[] : [];
}

export function referenceOpinionLine(answer: ReferenceAnswer, contacts: string[]) {
  let line = `${referenceSources[answer.source]} — ${answer.question}${answer.text ? ': ' + answer.text : ''}`;
  for (const contact of contacts) {
    if (contact) line = line.replaceAll(new RegExp(contact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[omitido]');
  }
  return redactProfessionalContacts(line);
}

export function redactProfessionalContacts(text: string) {
  return text.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[().\s-]*){8,}\d/g, '[omitido]');
}
