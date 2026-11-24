import { RgaSync } from '@/components/imports/rga-sync';
import { RGA_IMPORT_PROVIDER } from '@/lib/rga-import';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { db } from '@/lib/db';
import { isAdmin, requireSession } from '@/lib/session';
import { listImportJobs } from '@/server/imports/jobs';
import { PageHeader } from '@/components/page-header';
import { IMPORT_PROVIDERS } from '@/lib/import-providers';
import { NewImport } from '@/components/imports/new-import';
import { formatCount, IMPORT_STATUS, isOpen, timeAgo } from '@/components/imports/import-meta';
import { SiteIcon } from '@/components/site-icon';
import { buttonClass } from '@/components/ui/button';
import { Card, SectionHeader, StatusDot } from '@/components/ui/primitives';

export const metadata = { title: 'Importações' };

const OPEN_COPY = {
  DISCOVERING: { title: (p: string) => `Reading your ${p} setup`, action: 'View progress' },
  REVIEW: { title: (p: string) => `Your ${p} import is ready for review`, action: 'Review stages' },
  RUNNING: { title: (p: string) => `Importing from ${p}`, action: 'View progress' },
} as const;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const ctx = await requireSession();
  const { provider } = await searchParams;
  if (!isAdmin(ctx)) redirect('/settings');

  const [jobs, org] = await Promise.all([
    listImportJobs(ctx),
    db.organization.findUnique({ where: { id: ctx.orgId }, select: { retentionMonths: true } }),
  ]);
  const open = jobs.find((j) => isOpen(j.status));
  const past = jobs.filter((j) => j !== open);

  return (
    <div>
      <div className="px-6 pt-6">
        <Link
          href="/settings?section=data"
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors duration-[120ms] hover:text-ink"
        >
          <ArrowLeft size={14} /> Configurações
        </Link>
      </div>
      <PageHeader
        title="Importações"
        subtitle="Traga dados de planilhas ou de outros sistemas de recrutamento para o RGA ATS."
      />

      <div className="mx-6 mt-4 flex max-w-3xl flex-col gap-8 pb-8">
        {ctx.orgId === process.env.RGA_TALENT_SYNC_ORG_ID && <RgaSync />}
        {open && open.status in OPEN_COPY ? (
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5">
                <SiteIcon url={open.domain} size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-md font-medium text-ink">
                  {OPEN_COPY[open.status as keyof typeof OPEN_COPY].title(open.providerName)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                  <StatusDot tone={IMPORT_STATUS[open.status].tone} />
                  {IMPORT_STATUS[open.status].label}
                  {open.accountName ? <span>· {open.accountName}</span> : null}
                  <span>· Iniciada {timeAgo(open.startedAt)}</span>
                </p>
              </div>
            </div>
            <Link href={`/settings/import/${open.id}`} className={buttonClass({ variant: 'primary', className: 'self-start sm:self-auto' })}>
              {OPEN_COPY[open.status as keyof typeof OPEN_COPY].action}
            </Link>
          </Card>
        ) : null}

        <Card className="grid gap-3 p-5">
          <h2 className="text-md font-medium">Planilhas da RGA</h2>
          <p className="text-sm text-ink-2">Revise o mapeamento e a prévia antes de importar empresas, vagas e candidatos.</p>
          <Link href="/settings/import/planilha" className={buttonClass({ variant: 'primary', className: 'justify-self-start' })}>Importar planilha</Link>
        </Card>

        <NewImport
          blocked={!!open}
          retentionMonths={org?.retentionMonths ?? null}
          importedFrom={[...new Set(jobs.filter((j) => j.status === 'SUCCEEDED').map((j) => j.provider))]}
          initialProvider={!open && IMPORT_PROVIDERS.some((p) => p.id === provider) ? provider : null}
        />

        {past.length || !open ? (
          <section>
            <SectionHeader title="Histórico de importações" />
            {past.length ? (
              <Card className="divide-y divide-line overflow-hidden">
                {past.map((j) => (
                  <Link
                    key={j.id}
                    href={`/settings/import/${j.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                  >
                    {j.provider === RGA_IMPORT_PROVIDER ? <FileSpreadsheet size={20} aria-hidden="true" /> : <SiteIcon url={j.domain} size={20} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {j.provider === RGA_IMPORT_PROVIDER ? 'Planilha RGA' : j.providerName}
                        {j.accountName ? <span className="font-normal text-ink-2"> · {j.accountName}</span> : null}
                      </p>
                      {j.provider === RGA_IMPORT_PROVIDER ? (
                        <p className="mt-0.5 text-xs text-ink-2">{new Date(j.finishedAt ?? j.startedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                      ) : (
                        <p className="mt-0.5 truncate text-xs text-ink-2 tabular-nums">
                          {formatCount(j.created)} {j.created === 1 ? 'candidate' : "candidatos"} ·{' '}
                          {j.finishedAt ? `Finished ${timeAgo(j.finishedAt)}` : `Started ${timeAgo(j.startedAt)}`}
                        </p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
                      <StatusDot tone={IMPORT_STATUS[j.status].tone} />
                      {j.provider === RGA_IMPORT_PROVIDER ? 'Concluída' : IMPORT_STATUS[j.status].label}
                    </span>
                    <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </Card>
            ) : (
              <Card className="px-4 py-4">
                <p className="text-sm text-ink-2">
                  Nenhuma importação realizada. O histórico mostrará os registros de cada operação.
                </p>
              </Card>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
