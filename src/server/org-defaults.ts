// Defaults seeded into every new organization (signup and demo mode).
// Kept out of the 'use server' actions file so non-action code can import them.

// Leads (sourced) and applicants (inbound) arrive separately; the interview
// process after them is the part each team makes its own.
export const DEFAULT_STAGES = [
  { name: 'Novo talento', type: 'LEAD', order: 0 },
  { name: 'Contato realizado', type: 'LEAD', order: 1 },
  { name: 'Respondeu', type: 'LEAD', order: 2 },
  { name: 'Nova candidatura', type: 'APPLICANT', order: 3 },
  { name: 'Triagem por telefone', type: 'SCREEN', order: 4 },
  { name: 'Entrevista presencial', type: 'ONSITE', order: 5 },
  { name: 'Proposta', type: 'OFFER', order: 6 },
  { name: 'Contratado', type: 'HIRED', order: 7 },
] as const;

export const DEFAULT_ARCHIVE_REASONS = [
  { name: 'Qualificação insuficiente', countsAsRejection: true },
  { name: 'Incompatibilidade cultural ou de valores', countsAsRejection: true },
  { name: 'Indisponibilidade no momento', countsAsRejection: false },
  { name: 'Desistência', countsAsRejection: false },
  { name: 'Proposta recusada', countsAsRejection: false },
  { name: 'Vaga preenchida', countsAsRejection: false },
];
