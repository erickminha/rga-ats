import { cleanCriteria } from '@/lib/match-criteria';
import { publicPostingText } from '@/lib/public-careers';
export const defaultScale = ['Muito abaixo do esperado', 'Abaixo do esperado', 'Atende ao esperado', 'Acima do esperado', 'Muito acima do esperado'];

export type CompetencyPlan = { questions: string[]; scale: string[] };
export type Template = CompetencyPlan & { id: string; name: string; inactive: boolean };
export type InterviewReview = CompetencyPlan & {
  answers: { score: number | null; response: string; evidence: string }[];
  requirements: { label: string; result: string }[];
  recommendation: string;
  justification: string;
  completed: boolean;
  reviewerId: string;
  savedAt: string;
};

export const requirementLabels = {
  YES: 'Atende', PARTIAL: 'Atende parcialmente', NO: 'Não atende',
  UNVERIFIED: 'Não verificado', NA: 'Não se aplica',
};

export const recommendationLabels = {
  YES: 'Recomendado', RESERVED: 'Recomendado com ressalvas', NO: 'Não recomendado',
  INCONCLUSIVE: 'Avaliação inconclusiva', WAIT: 'Aguardando informações complementares',
};

const initialModels = [
  ['Operacional', 'Organização e segurança no trabalho', 'Trabalho em equipe'],
  ['Administrativa', 'Organização e priorização de tarefas', 'Comunicação'],
  ['Comercial', 'Atendimento ao cliente', 'Negociação e acompanhamento'],
  ['Técnica', 'Conhecimento técnico', 'Resolução de problemas'],
  ['Liderança', 'Liderança e delegação', 'Gestão de conflitos'],
  ['Estágio', 'Capacidade de aprendizagem', 'Proatividade'],
];

export const initialTemplates: Template[] = initialModels.map(([name, ...competencies], index) => ({
  id: 'rga-' + index, name, inactive: false, scale: defaultScale,
  questions: competencies.map((item) => item + ' — descreva uma situação, sua ação e o resultado.'),
}));

export function readTemplates(value: unknown): Template[] {
  return Array.isArray(value) ? value as Template[] : initialTemplates;
}

export function readPlan(value: unknown): CompetencyPlan | null {
  if (value && typeof value === 'object' && 'questions' in value && Array.isArray(value.questions)
    && 'scale' in value && Array.isArray(value.scale)) return value as CompetencyPlan;
  return null;
}

export function readInterview(value: unknown): InterviewReview | null {
  return readPlan(value) && value && typeof value === 'object' && 'answers' in value && Array.isArray(value.answers)
    ? value as InterviewReview : null;
}

export function ratedAverage(answers: { score: number | null }[]) {
  const scores = answers.flatMap(({ score }) => score === null ? [] : [score]);
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
}

export function readText(form: FormData, field: string, maxLength = 4000) {
  const value = form.get(field);
  if (value === null) return '';
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new Error('Confira o limite de tamanho dos campos.');
  return value.trim();
}

export function planFromForm(form: FormData): CompetencyPlan {
  const questions = readText(form, 'questions', 3000).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const scale = readText(form, 'scale', 1000).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (questions.length > 12 || questions.some((item) => item.length > 240)
    || scale.length !== 5 || scale.some((item) => item.length > 120)) {
    throw new Error('Use até 12 perguntas e informe cinco descrições para a escala.');
  }
  return { questions: [...new Set(questions)], scale };
}

export const discDetails = {
  date: 'Data da avaliação', instrument: 'Instrumento ou fornecedor', profile: 'Perfil predominante',
  traits: 'Características profissionais observadas', strengths: 'Pontos fortes',
  development: 'Pontos de desenvolvimento', communication: 'Estilo de comunicação',
};

export function discScale(min: string, max: string) {
  if (!min && !max) return null;
  const parse = (value: string) => /^-?\d{1,8}([.,]\d{1,6})?$/.test(value) ? Number(value.replace(',', '.')) : Number.NaN;
  return min && max && parse(max) > parse(min) ? { min: parse(min), max: parse(max), parse } : null;
}

export function postingRequirements(criteria: unknown, content: unknown) {
  const labels = [...cleanCriteria(criteria).map(({ label }) => label),
    ...publicPostingText(content).requirements.map((label) => label.slice(0, 240))];
  const unique = new Map<string, string>();
  for (const label of labels) {
    const key = label.toLocaleLowerCase('pt-BR');
    if (!unique.has(key)) unique.set(key, label);
  }
  return [...unique.values()].slice(0, 12).map((label) => ({ label }));
}
