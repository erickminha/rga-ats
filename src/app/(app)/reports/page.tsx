import { outcomeCategory, outcomeNames } from '@/lib/i18n/pt-BR/recruiting';
import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { organization } from '@/lib/i18n/pt-BR/organization';
import { BarChart3 } from 'lucide-react';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
  stagePassThrough,
  stagePassThroughBy,
  timeInStage,
  velocityByPosting,
  interviewerLoad,
  recruiterProductivity,
  avgDaysToHire as avgDaysToHireFor,
} from '@/server/analytics';
import { createReportScheduleAction, deleteReportScheduleAction } from '@/app/org-actions';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { SavedReports } from '@/components/saved-reports';
import { FormSelect } from '@/components/form-select';
import { btnSecondary, btnTonal, inputClass, surface, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { SectionHeader, Segmented } from '@/components/ui/primitives';
import { cn, firstParams, type SearchParams } from '@/lib/utils';
import { DitherBar, DitherColumns } from '@/components/ui/dither';

const ORIGIN_LABELS: Record<string, string> = {
  APPLIED: "Candidatura",
  SOURCED: "Prospecção",
  REFERRED: "Indicação",
  AGENCY: organization.kinds.AGENCY.title,
  INTERNAL: "Interna",
  UNIVERSITY: "Universidade",
};

// Dithered ink bar (docs/09 §11)
function Bar({ value, max }: { value: number; max: number }) {
  return <DitherBar value={value} max={max} />;
}

/** A report panel: section label on the canvas above a white card. */
function Panel({
  title,
  action,
  bodyClassName,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <SectionHeader title={title} action={action} />
      <div className={cn(surface, 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export const metadata = { title: navigation.reports };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireSession();
  const { by: byRaw } = await firstParams(searchParams);
  const by = byRaw === 'department' || byRaw === 'owner' ? byRaw : 'posting';

  const isAdmin = ctx.accessRole === 'SUPER_ADMIN' || ctx.accessRole === 'ADMIN';

  const [
    stages,
    stageCounts,
    originCounts,
    archiveCounts,
    archiveReasons,
    totals,
    savedReports,
    funnel,
    groupedFunnel,
    dwell,
    velocity,
    schedules,
    interviewers,
    recruiters,
    offerCounts,
    hireDays,
    eeoCounts,
  ] = await Promise.all([
    db.stage.findMany({ where: { orgId: ctx.orgId }, orderBy: { order: 'asc' } }),
    db.opportunity.groupBy({
      by: ['stageId'],
      where: { orgId: ctx.orgId, status: 'ACTIVE' },
      _count: true,
    }),
    db.opportunity.groupBy({ by: ['origin'], where: { orgId: ctx.orgId }, _count: true }),
    db.opportunity.groupBy({
      by: ['archiveReasonId'],
      where: { orgId: ctx.orgId, status: 'ARCHIVED' },
      _count: true,
    }),
    db.archiveReason.findMany({ where: { orgId: ctx.orgId } }),
    Promise.all([
      db.opportunity.count({ where: { orgId: ctx.orgId } }),
      db.opportunity.count({ where: { orgId: ctx.orgId, status: 'HIRED' } }),
      db.opportunity.count({ where: { orgId: ctx.orgId, status: 'ARCHIVED' } }),
      db.posting.count({ where: { orgId: ctx.orgId, state: 'PUBLISHED' } }),
    ]),
    db.savedReport.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
    }),
    stagePassThrough(ctx.orgId),
    stagePassThroughBy(ctx.orgId, by),
    timeInStage(ctx.orgId),
    velocityByPosting(ctx.orgId),
    isAdmin
      ? db.reportSchedule.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
    interviewerLoad(ctx.orgId),
    recruiterProductivity(ctx.orgId),
    db.offer.groupBy({ by: ['status'], where: { orgId: ctx.orgId }, _count: true }),
    avgDaysToHireFor(ctx.orgId),
    isAdmin
      ? Promise.all([
          db.eeoResponse.groupBy({ by: ['gender'], where: { orgId: ctx.orgId }, _count: true }),
          db.eeoResponse.groupBy({ by: ['race'], where: { orgId: ctx.orgId }, _count: true }),
          db.eeoResponse.count({ where: { orgId: ctx.orgId } }),
        ])
      : Promise.resolve(null),
  ]);
  // Small pools make individuals identifiable — hold the breakdown until then
  const EEO_MIN = 5;
  const eeoTotal = eeoCounts?.[2] ?? 0;
  const eeoData =
    eeoCounts && eeoTotal >= EEO_MIN
      ? {
          gender: eeoCounts[0].map((g) => ({ name: g.gender, count: g._count })).sort((a, b) => b.count - a.count),
          race: eeoCounts[1].map((r) => ({ name: r.race, count: r._count })).sort((a, b) => b.count - a.count),
        }
      : null;
  const offerOf = (status: string) => offerCounts.find((o) => o.status === status)?._count ?? 0;
  const accepted = offerOf('ACCEPTED');
  const declined = offerOf('DECLINED');
  const offerTotal = offerCounts.reduce((sum, o) => sum + o._count, 0);
  const acceptanceRate =
    accepted + declined > 0 ? Math.round((accepted / (accepted + declined)) * 100) : null;
  const avgDaysToHire = hireDays === null ? null : Math.round(hireDays);

  const [totalOpportunities, hired, archived, openPostings] = totals;

  if (totalOpportunities === 0) {
    return (
      <div>
        <PageHeader title="Relatórios" subtitle="Funil, origens e resultados" />
        <EmptyState
          icon={BarChart3}
          title="Nenhum dado para o relatório"
          description="Os relatórios são atualizados conforme as candidaturas avançam pelo funil."
        />
      </div>
    );
  }

  const stageData = stages.map((s) => ({
    name: s.name,
    count: stageCounts.find((c) => c.stageId === s.id)?._count ?? 0,
  }));
  const stageMax = Math.max(...stageData.map((s) => s.count), 1);

  const originData = originCounts
    .map((o) => ({ name: ORIGIN_LABELS[o.origin] ?? o.origin, count: o._count }))
    .sort((a, b) => b.count - a.count);
  const originMax = Math.max(...originData.map((o) => o.count), 1);

  const reasonName = new Map(archiveReasons.map((r) => [r.id, r.name]));
  const archiveData = archiveCounts
    .map((a) => ({
      name: (a.archiveReasonId && reasonName.get(a.archiveReasonId)) || 'No reason',
      count: a._count,
    }))
    .sort((a, b) => b.count - a.count);

  const archiveCategories = { REJECTION: 0, WITHDRAWAL: 0, ADMINISTRATIVE: 0 };
  const reasonsById = new Map(archiveReasons.map((reason) => [reason.id, reason]));
  for (const group of archiveCounts) archiveCategories[outcomeCategory(reasonsById.get(group.archiveReasonId ?? ''))] += group._count;
  const stats = [
    { label: "Candidatos", value: String(totalOpportunities) },
    { label: "Em andamento", value: String(totalOpportunities - hired - archived) },
    { label: "Contratados", value: String(hired) },
    ...Object.entries(archiveCategories).map(([key, count]) => ({
      label: outcomeNames[key as keyof typeof outcomeNames], value: count.toLocaleString('pt-BR'),
    })),
    { label: "Vagas abertas", value: String(openPostings) },
    { label: "Média de dias até contratação", value: avgDaysToHire !== null ? String(avgDaysToHire) : '—' },
    { label: "Propostas enviadas", value: String(offerTotal) },
    { label: "Aceite de propostas", value: acceptanceRate !== null ? `${acceptanceRate}%` : '—' },
  ];

  const dimLabel = { posting: 'Posting', department: 'Department', owner: 'Owner' } as const;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Funil, origens e resultados"
        actions={
          <>
            <a href="/reports/builder" className={btnSecondary}>
              Criar relatório
            </a>
            {isAdmin ? <a href="/api/reports/export" className={btnSecondary}>
              Exportar CSV
            </a> : null}
          </>
        }
      />

      <div className="mx-6 mt-4 flex flex-col gap-8 pb-8">
        <SavedReports
          reports={savedReports.map((r) => ({
            id: r.id,
            name: r.name,
            query: new URLSearchParams((r.config ?? {}) as Record<string, string>).toString(),
          }))}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className={`${surface} p-4`}>
              <p className="text-2xl text-ink tabular-nums">{s.value}</p>
              <p className="mt-1 text-xs text-ink-2">{s.label}</p>
            </div>
          ))}
        </div>

        <Panel title="Candidatos ativos por etapa">
          <div className="flex flex-col gap-3">
            {stageData.map((s) => (
              <div key={s.name} className="grid grid-cols-[140px_1fr_32px] items-center gap-3">
                <span className="truncate text-sm">{s.name}</span>
                <Bar value={s.count} max={stageMax} />
                <span className="text-right text-xs text-ink-2 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Conversão entre etapas">
          <div className="flex flex-col gap-3">
            {funnel.map((f) => (
              <div key={f.name} className="grid grid-cols-[140px_1fr_120px] items-center gap-3">
                <span className="truncate text-sm">{f.name}</span>
                <Bar value={f.reached} max={Math.max(funnel[0]?.reached ?? 1, 1)} />
                <span className="text-right text-xs text-ink-2 tabular-nums">
                  {f.reached}
                  {f.conversion !== null ? ` · ${f.conversion}%` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-2">
            Candidatos que chegaram a cada etapa e percentual de conversão em relação à anterior.
          </p>
        </Panel>

        <div className="grid gap-x-3 gap-y-8 md:grid-cols-2">
          <Panel title="Tempo na etapa">
            {dwell.some((d) => (d.avgDays ?? 0) > 0) ? (
              <DitherColumns
                className="mb-5"
                height={96}
                unit="d"
                data={dwell.map((d) => ({ label: d.name, value: d.avgDays }))}
              />
            ) : null}
            <div className="flex flex-col gap-2.5">
              {dwell.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{d.name}</span>
                  <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                    {d.avgDays !== null ? `${d.avgDays} days avg · ${d.samples} moves` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Tempo de recrutamento por vaga">
            <div className="flex flex-col gap-2.5">
              {velocity.slice(0, 8).map((v) => (
                <div key={v.posting} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{v.posting}</span>
                  <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                    {v.active} ativos · {v.hired} contratados
                    {v.avgDaysToHire !== null ? ` · ${v.avgDaysToHire}d to hire` : ''}
                  </span>
                </div>
              ))}
              {velocity.length === 0 ? (
                <p className="text-sm text-ink-2">Nenhuma movimentação registrada.</p>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="grid gap-x-3 gap-y-8 md:grid-cols-2">
          <Panel title="Atividade por recrutador">
            {recruiters.length ? (
              <div className="flex flex-col gap-2.5">
                {recruiters.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                      {r.active} ativos · {r.hired} contratados · {r.archived} encerrados
                      {r.avgDaysToHire !== null ? ` · ${r.avgDaysToHire}d to hire` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Defina responsáveis pelas participações para acompanhar os números.</p>
            )}
          </Panel>

          <Panel title="Entrevistas por entrevistador">
            {interviewers.length ? (
              <div className="flex flex-col gap-2.5">
                {interviewers.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{i.name}</span>
                    <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                      {i.scheduled} entrevistas · {i.completed} concluídas
                      {i.feedbackRate !== null ? ` · ${i.feedbackRate}% feedback` : ''}
                      {i.avgRating !== null ? ` · ${i.avgRating} avg` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Nenhuma entrevista agendada.</p>
            )}
          </Panel>
        </div>

        <Panel
          title={`Pass-through by ${by}`}
          action={
            <Segmented
              size="sm"
              value={by}
              items={(['posting', 'department', 'owner'] as const).map((dim) => ({
                value: dim,
                label: dimLabel[dim],
                href: `/reports?by=${dim}`,
              }))}
            />
          }
          bodyClassName="overflow-hidden px-2 py-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2.5 text-xs font-medium text-ink-2">{dimLabel[by]}</th>
                  {groupedFunnel.stages.map((s) => (
                    <th key={s} className="px-3 py-2.5 text-right text-xs font-medium text-ink-2">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {groupedFunnel.rows.slice(0, 12).map((row) => (
                  <tr key={row.group} className="transition-colors duration-[120ms] hover:bg-muted/60">
                    <td className="max-w-52 truncate px-3 py-2.5">{row.group}</td>
                    {row.reached.map((n, i) => (
                      <td key={i} className="px-3 py-2.5 text-right text-ink-2 tabular-nums">
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {isAdmin ? (
          <Panel title="Resumo por e-mail">
            <p className="mb-4 text-sm text-ink-2">
              Receba indicadores de recrutamento, conversão e tempo por e-mail.
            </p>
            {schedules.length ? (
              <div className="mb-4 flex flex-col divide-y divide-line">
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0">
                    <span className="min-w-0 truncate">
                      <span className="text-xs text-ink-2 capitalize">{s.cadence.toLowerCase()}</span>{' '}
                      → {s.recipients.join(', ')}
                    </span>
                    <form action={deleteReportScheduleAction.bind(null, s.id)}>
                      <button
                        type="submit"
                        className={buttonClass({ variant: 'ghost', size: 'xs', className: 'hover:text-critical' })}
                      >
                        Remover
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : null}
            <form action={createReportScheduleAction} className="flex flex-wrap items-center gap-2">
              <FormSelect
                name="cadence"
                defaultValue="WEEKLY"
                options={[
                  { value: 'WEEKLY', label: "Semanal" },
                  { value: 'DAILY', label: "Diário" },
                ]}
                className="w-28"
              />
              <input {...noAutofill}
                name="recipients"
                type="text"
                required
                placeholder="you@company.com, cofounder@company.com"
                className={cn(inputClass, 'min-w-64 flex-1')}
              />
              <button type="submit" className={btnTonal}>
                Agendar resumo
              </button>
            </form>
          </Panel>
        ) : null}

        <div className="grid gap-x-3 gap-y-8 md:grid-cols-2">
          <Panel title="Candidatos por origem">
            <div className="flex flex-col gap-3">
              {originData.map((o) => (
                <div key={o.name} className="grid grid-cols-[100px_1fr_32px] items-center gap-3">
                  <span className="truncate text-sm">{o.name}</span>
                  <Bar value={o.count} max={originMax} />
                  <span className="text-right text-xs text-ink-2 tabular-nums">{o.count}</span>
                </div>
              ))}
            </div>
          </Panel>

          {isAdmin && eeoTotal > 0 ? (
            <Panel title="Autodeclarações EEO (agregadas)">
              <p className="mb-4 text-xs text-ink-2 tabular-nums">
                {eeoTotal} respostas voluntárias sem vínculo com os candidatos.
              </p>
              {eeoData ? (
                <div className="flex flex-col gap-2.5">
                  {[...eeoData.gender, ...eeoData.race]
                    .filter((d) => d.name !== 'declined')
                    .map((d, i) => (
                      <div key={`${d.name}-${i}`} className="flex items-center justify-between text-sm">
                        <span>{d.name}</span>
                        <span className="text-xs text-ink-2 tabular-nums">{d.count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-ink-2">
                  A distribuição fica visível a partir de {5} respostas para preservar o anonimato.
                </p>
              )}
            </Panel>
          ) : null}

          <Panel title="Motivos de encerramento">
            {archiveData.length ? (
              <div className="flex flex-col gap-2.5">
                {archiveData.map((a) => (
                  <div key={a.name} className="flex items-center justify-between text-sm">
                    <span>{a.name}</span>
                    <span className="text-xs text-ink-2 tabular-nums">{a.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Nenhuma participação encerrada.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
