export const screeningLabels = {
  ADVANCE: 'Recomendar avanço',
  REVIEW: 'Manter em análise',
  STOP: 'Não recomendar avanço',
} as const;

export const opinionFields = {
  history: 'Histórico profissional',
  experience: 'Experiência relevante para a vaga',
  interview: 'Impressões durante a entrevista',
  competencies: 'Competências observadas',
  concerns: 'Pontos de atenção',
  behavior: 'Síntese comportamental',
  recommendation: 'Recomendação profissional',
} as const;

export const discAxes = ['D', 'I', 'S', 'C'] as const;

export function textRecord(value: unknown): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((item): item is [string, string] => typeof item[1] === 'string')) : {};
}
