import type { StageType } from '@prisma/client';

/**
 * Stage types, and the three groups a pipeline is edited in. The type is what
 * a stage means to Source whatever it's called: careers-page applications
 * land in the first Applicant stage, sourced candidates and referrals in the
 * first Lead stage, scheduling is offered in Screen and Interview stages, a
 * move into Hired marks the hire, and reports compare pipelines by type.
 *
 * Plain module (no server imports) so the stage editor can guess a type as
 * someone types a name.
 */

export type StageGroup = 'lead' | 'applicant' | 'interview';

export const STAGE_GROUPS: { id: StageGroup; title: string; description: string }[] = [
  { id: 'lead', title: 'Prospecção', description: 'Pessoas que a equipe identifica e aborda.' },
  { id: 'applicant', title: 'Candidaturas', description: 'Pessoas que se candidatam pela página de carreiras ou são indicadas.' },
  { id: 'interview', title: 'Entrevistas', description: 'Da primeira triagem até a contratação. Ajuste as etapas ao seu processo seletivo.' },
];

export function stageGroup(type: StageType): StageGroup {
  return type === 'LEAD' ? 'lead' : type === 'APPLICANT' ? 'applicant' : 'interview';
}

/** Leads come first, then applicants, then the interview process: the groups never interleave. */
export const GROUP_RANK: Record<StageGroup, number> = { lead: 0, applicant: 1, interview: 2 };

/** What a stage in the Interview group can count as. */
export const INTERVIEW_TYPES: { value: StageType; label: string }[] = [
  { value: 'SCREEN', label: 'Triagem' },
  { value: 'ONSITE', label: 'Entrevista' },
  { value: 'OFFER', label: 'Proposta' },
  { value: 'HIRED', label: 'Contratação' },
];

export const TYPE_RANK: Record<StageType, number> = {
  LEAD: 0,
  APPLICANT: 1,
  SCREEN: 2,
  ONSITE: 3,
  OFFER: 4,
  HIRED: 5,
};

/**
 * Guess a StageType from a stage name. Checked most-specific first:
 * "Offer Extended" is OFFER even though it contains no "hired", and
 * "Hiring Manager Screen" is SCREEN — "hiring" is not "hired".
 */
export function inferStageType(name: string): StageType {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(contratad[oa]s?|contratacao|admissao|admitid[oa]s?)\b/.test(n)) return 'HIRED';
  if (/\b(proposta|oferta)\b/.test(n)) return 'OFFER';
  if (/\b(entrevista|finalistas?|avaliacao disc|parecer|apresentacao ao cliente)\b/.test(n)) return 'ONSITE';
  if (/\b(prospeccao|novo talento|contato realizado|respondeu|abordagem)\b/.test(n)) return 'LEAD';
  if (/\b(candidatura|inscricao|novo candidato)\b/.test(n)) return 'APPLICANT';
  if (/\bhired?\b|\bplaced\b|\bstarted\b|\bonboard/.test(n)) return 'HIRED';
  if (/\boffer\b|\breference/.test(n)) return 'OFFER';
  if (/on-?site|face[ -]to[ -]face|\bfinal\b|\bpanel\b|\bloop\b|\bsuper ?day\b|in[ -]person/.test(n)) return 'ONSITE';
  if (/\blead\b|\bprospect|\bsourced\b|reached out|\bcontacted\b|\bresponded\b|\boutreach\b|\bnurture/.test(n)) return 'LEAD';
  if (/\bnew\b|\bapplicant|\bapplication|\bapplied\b|\binbox\b|\breview\b|\bunscreened\b|\bnew candidate/.test(n)) return 'APPLICANT';
  return 'SCREEN';
}

/** The type a new Interview-group stage most likely has: "Client interview" → Interview, "Offer" → Offer. */
export function guessInterviewType(name: string): StageType {
  const n = name.toLowerCase();
  const t = inferStageType(name);
  if (t === 'LEAD' || t === 'APPLICANT') return 'SCREEN';
  // Within the interview process, a plain "interview" is past the screen.
  if (t === 'SCREEN' && /\binterview|\bpresent|\bassessment|\bcase\b|\btake[ -]?home/.test(n)) return 'ONSITE';
  return t;
}
