import { appLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { PoweredBySource } from '@/components/powered-by';
import { db } from '@/lib/db';
import { resolveShare } from '@/server/share-links';
import { ensureSamplePresentation, SAMPLE_PRESENTATION_CODE } from '@/server/sample-boards';

/** Share links are for the people they're sent to, never search results. */
export const metadata = { robots: { index: false, follow: false } };
import { CandidatePresentation } from '@/components/candidate-presentation';
import { sectionLabel } from '@/components/form-controls';
import { Badge } from '@/components/ui/primitives';
import { DitherBar } from '@/components/ui/dither';

/**
 * Client-facing hiring update — public via signed link, deliberately
 * shallow: pipeline shape and candidate progress only. Nothing internal
 * crosses this boundary (no notes, scorecards, emails, comp, sources,
 * origins, or team identities). Same data philosophy as Reports, scoped
 * to what a client of the hiring process should see.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token === SAMPLE_PRESENTATION_CODE) await ensureSamplePresentation();
  const payload = await resolveShare(token);
  if (!payload) notFound();

  const org = await db.organization.findUnique({ where: { id: payload.orgId } });
  if (!org) notFound();

  if (payload.scope === 'candidate') {
    return (
      <>
        <CandidatePresentation orgId={org.id} opportunityId={payload.id} />
        <footer className="mx-auto flex max-w-3xl justify-center px-6 pb-8">
          <PoweredBySource />
        </footer>
      </>
    );
  }

  const postingWhere =
    payload.scope === 'posting' ? { id: payload.id } : { clientCompanyId: payload.id };
  const postings = await db.posting.findMany({
    where: { orgId: org.id, ...postingWhere },
    include: { clientCompany: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!postings.length) notFound();

  const clientName = payload.scope === 'client' ? postings[0].clientCompany?.name : null;
  const postingIds = postings.map((p) => p.id);

  const [stages, opportunities] = await Promise.all([
    db.stage.findMany({ where: { orgId: org.id }, orderBy: { order: 'asc' } }),
    db.opportunity.findMany({
      where: { orgId: org.id, postingId: { in: postingIds } },
      include: {
        contact: { select: { name: true } },
        stage: { select: { name: true, order: true } },
        posting: { select: { title: true } },
        interviews: { select: { state: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const active = opportunities.filter((o) => o.status === 'ACTIVE');
  const hired = opportunities.filter((o) => o.status === 'HIRED');
  const interviewsDone = opportunities.reduce(
    (sum, o) => sum + o.interviews.filter((iv) => iv.state === 'COMPLETED').length,
    0,
  );
  const byStage = stages
    .map((s) => ({ name: s.name, count: active.filter((o) => o.stage.name === s.name).length }))
    .filter((s) => s.count > 0);
  const stageMax = Math.max(...byStage.map((s) => s.count), 1);

  const stats = [
    { label: 'Candidatos', value: opportunities.length },
    { label: 'Em processo', value: active.length },
    { label: 'Entrevistas concluídas', value: interviewsDone },
    { label: 'Contratados', value: hired.length },
  ];

  const daysIn = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className={sectionLabel}>{org.name} · Acompanhamento de vagas</p>
      <h1 className="mt-2 text-3xl">{clientName ?? postings[0].title}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {postings.length > 1 ? `${postings.length} vagas abertas · ` : ''}
        Atualizado em {new Date().toLocaleDateString(appLocale, { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card bg-surface p-4">
            <p className="text-2xl tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs text-ink-2">{s.label}</p>
          </div>
        ))}
      </div>

      {byStage.length ? (
        <section className="mt-8 rounded-card bg-surface p-5">
          <h2 className={`mb-4 ${sectionLabel}`}>Funil ativo</h2>
          <div className="flex flex-col gap-3">
            {byStage.map((s) => (
              <div key={s.name} className="grid grid-cols-[140px_1fr_32px] items-center gap-3">
                <span className="truncate text-sm">{s.name}</span>
                <DitherBar value={s.count} max={stageMax} label={`${s.name}: ${s.count}`} />
                <span className="text-right text-xs tabular-nums text-ink-2">{s.count}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 overflow-hidden rounded-card bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {['Candidato', ...(postings.length > 1 ? ['Vaga'] : []), 'Etapa', 'Dias em processo'].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-medium text-ink-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opportunities.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{o.contact.name}</td>
                {postings.length > 1 ? (
                  <td className="px-4 py-3 text-ink-2">{o.posting?.title}</td>
                ) : null}
                <td className="px-4 py-3">
                  <Badge
                    tone={o.status === 'HIRED' ? 'positive' : o.status === 'ARCHIVED' ? 'neutral' : undefined}
                  >
                    {o.status === 'HIRED' ? 'Contratado' : o.status === 'ARCHIVED' ? 'Fora do processo' : o.stage.name}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-ink-2">
                  {daysIn(o.createdAt)}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-8 flex justify-center">
        <PoweredBySource />
      </div>
    </div>
  );
}
