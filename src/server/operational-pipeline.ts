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

export function operationalConditions(orgId: string, now: Date, presented: string[], waiting: string[], approved: string[]): Record<Metric, Prisma.OpportunityWhereInput> {
  const active = { status: 'ACTIVE' } as const;
  const finalist = { orgId, name: { in: ['Finalistas', 'Avaliação DISC', 'Parecer', 'Apresentação ao cliente'] } };
  const completed = { orgId, state: 'COMPLETED' } as const;
  return {
    interview: { ...active, OR: [{ interviews: { some: { orgId, state: 'SCHEDULED' } } }, {
      stage: { orgId, name: 'Entrevista' }, interviews: { none: completed },
    }] },
    interviewed: { interviews: { some: completed } },
    disc: { ...active, stage: finalist, nativeDiscs: { none: { simulation: false, submittedAt: { not: null }, cancelledAt: null } },
      NOT: { recruitingAssessment: { is: { disc: { path: ['complete'], equals: true } } } } },
    references: { ...active, OR: [
      { referenceCheck: { is: { status: { notIn: ['VERIFIED', 'UNVERIFIABLE', 'WAIVED'] } } } },
      { referenceCheck: null, stage: { ...finalist, name: { in: [...finalist.name.in, 'Verificação de referências'] } } },
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
