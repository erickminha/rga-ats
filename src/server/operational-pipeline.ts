import type { Prisma } from '@prisma/client';

export const operationalLabels = {
  interview: 'Aguardando entrevista',
  interviewed: 'Entrevistas realizadas',
  disc: 'DISC pendentes',
  references: 'Referências pendentes',
  opinion: 'Pareceres pendentes',
  presented: 'Finalistas apresentados',
  client: 'Aguardando retorno do cliente',
  approved: 'Aprovados',
  hired: 'Contratados',
  stale: 'Sem movimentação há 7 dias',
};

type Metric = keyof typeof operationalLabels;

export function inferOperationalRole(name: string): string | null {
  const normalized = name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (['entrevista', 'entrevista presencial', 'on-site', 'onsite'].includes(normalized)) return 'INTERVIEW';
  if (['finalistas', 'avaliacao disc', 'parecer', 'apresentacao ao cliente'].includes(normalized)) return 'FINALIST';
  if (['verificacao de referencias', 'referencias profissionais'].includes(normalized)) return 'REFERENCES';
  return null;
}

// Legacy stages inserted by older setup/import paths acquire their role when first renamed.
// Persisted roles always take precedence over the display label.
function operationalStage(orgId: string, roles: string[], legacyNames: string[]): Prisma.StageWhereInput {
  return { orgId, OR: [
    { operationalRole: { in: roles } },
    { operationalRole: null, name: { in: legacyNames, mode: 'insensitive' } },
  ] };
}


export function operationalConditions(orgId: string, now: Date, presented: string[], waiting: string[], approved: string[]): Record<Metric, Prisma.OpportunityWhereInput> {
  const active = { status: 'ACTIVE' } as const;
  const finalistNames = ['Finalistas', 'Avaliação DISC', 'Parecer', 'Apresentação ao cliente'];
  const finalist = operationalStage(orgId, ['FINALIST'], finalistNames);
  const completed = { orgId, state: 'COMPLETED' } as const;
  return {
    interview: { ...active, OR: [{ interviews: { some: { orgId, state: 'SCHEDULED' } } }, {
      stage: operationalStage(orgId, ['INTERVIEW'], ['Entrevista', 'Entrevista presencial', 'On-site', 'Onsite']), interviews: { none: completed },
    }] },
    interviewed: { interviews: { some: completed } },
    disc: { ...active, stage: finalist, nativeDiscs: { none: { simulation: false, submittedAt: { not: null }, cancelledAt: null } },
      NOT: { recruitingAssessment: { is: { disc: { path: ['complete'], equals: true } } } } },
    references: { ...active, OR: [
      { referenceCheck: { is: { status: { notIn: ['VERIFIED', 'UNVERIFIABLE', 'WAIVED'] } } } },
      { referenceCheck: null, stage: operationalStage(orgId, ['FINALIST', 'REFERENCES'], [...finalistNames, 'Verificação de referências', 'Referências profissionais']) },
    ] },
    opinion: { ...active, OR: [{ stage: finalist }, { recruitingAssessment: { is: { opinionDraftAt: { not: null } } } }],
      NOT: { recruitingAssessment: { is: { opinionFinalizedAt: { not: null } } } } },
    presented: { id: { in: presented }, confidential: false },
    client: { ...active, id: { in: waiting }, confidential: false },
    approved: { id: { in: approved } },
    hired: { status: 'HIRED' },
    stale: { ...active, stageChangedAt: { lte: new Date(+now - 7 * 86_400_000) } },
  };
}

export function operationalDate(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00-03:00');
  if (!Number.isFinite(+date) || new Date(+date - 3 * 3600_000).toISOString().slice(0, 10) !== value) return undefined;
  return end ? new Date(+date + 86_400_000) : date;
}
