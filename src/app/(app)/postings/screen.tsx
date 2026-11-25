import Link from 'next/link';
import { Briefcase, Eye, Plus, Search } from 'lucide-react';
import type { loadPostingsPage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { PostingStateBadge, PostingStateMenu, PostingStateScope } from '@/components/posting-state-menu';
import { RequisitionsManager } from '@/components/requisitions-manager';
import { RequisitionLink } from '@/components/requisition-link';
import { btnPrimary, inputClass, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Orb } from '@/components/ui/orb';
import { Chip, Segmented, StatusDot } from '@/components/ui/primitives';

const COMMITMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Tempo integral',
  PART_TIME: 'Meio período',
  CONTRACT: 'Contrato',
  INTERNSHIP: 'Estágio',
};

const WORKPLACE_LABELS: Record<string, string> = {
  ONSITE: 'Presencial',
  HYBRID: 'Híbrida',
  REMOTE: 'Remota',
};

const VISIBILITY = [
  { key: '', label: 'Todas', tone: 'neutral' },
  { key: 'DRAFT', label: 'Rascunhos', tone: 'neutral' },
  { key: 'PENDING_APPROVAL', label: 'Aguardando aprovação', tone: 'caution' },
  { key: 'PUBLISHED', label: 'Externa', tone: 'positive' },
  { key: 'INTERNAL', label: 'Somente interna', tone: 'info' },
] as const;

export function PostingsScreen({ data }: { data: Awaited<ReturnType<typeof loadPostingsPage>> }) {
  const href = (over: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = {
      status: data.archived ? "archived" : '',
      state: data.stateFilter,
      q: data.q,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/postings?${qs}` : '/postings';
  };


  return (
    <div className="t-reveal flex h-screen flex-col">
      <PageHeader
        title="Vagas"
        subtitle="Crie e gerencie as vagas do recrutamento"
        actions={data.canEditPostings ? (
          <Link href="/postings/new" className={btnPrimary}>
            <Plus /> Criar vaga
          </Link>
        ) : undefined}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {data.canViewClients ? (
            <Link href="/clients" className={buttonClass({ variant: 'tonal', size: 'sm' })}>Empresas clientes</Link>
          ) : null}
          <Segmented
            size="sm"
            value={data.archived ? "archived" : 'active'}
            items={[
              { value: 'active', label: "Em andamento", href: href({ status: '', state: '' }) },
              { value: 'archived', label: "Encerradas", href: href({ status: 'archived', state: '' }) },
            ]}
          />
          {!data.archived
            ? VISIBILITY.map((v) => (
                <Chip key={v.key} href={href({ state: v.key })} selected={data.stateFilter === v.key}>
                  <StatusDot tone={v.tone} />
                  {v.label}
                </Chip>
              ))
            : null}
          <form method="get" action="/postings" className="relative ml-auto w-full max-w-xs">
            {data.archived ? <input type="hidden" name="status" value="archived" /> : null}
            {data.stateFilter ? <input type="hidden" name="state" value={data.stateFilter} /> : null}
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input {...noAutofill}
              type="search"
              name="q"
              defaultValue={data.q}
              placeholder="Buscar vagas, clientes e localidades…"
              aria-label="Buscar vagas"
              className={`${inputClass} pl-9`}
            />
          </form>
        </div>

        {data.rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={data.archived ? 'Nenhuma vaga encerrada' : 'Nenhuma vaga corresponde aos filtros'}
            description={
              data.archived
                ? 'As vagas encerradas aparecerão aqui.'
                : 'Crie uma vaga para começar a receber candidaturas.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-card bg-surface">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {[
                    'Cargo',
                    'Empresa',
                    'Link',
                    'Modalidade',
                    'Tipo de contratação',
                    'Localidade',
                    'Requisição',
                    'Situação',
                    '',
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-ink-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((p) => {
                  const logoId = p.logoFileId ?? data.org?.logoFileId ?? null;
                  return (
                    <PostingStateScope
                      key={p.id}
                      postingId={p.id}
                      state={p.state}
                      isAdmin={data.isAdmin}
                      requireApproval={data.org?.requirePostingApproval ?? false}
                    >
                      <tr className="transition-colors duration-[120ms] hover:bg-muted/60">
                        <td className="px-3 py-2.5 font-medium">
                          <Link href={`/postings/${p.id}`} className="flex items-center gap-3 hover:underline">
                            <Orb seed={p.id} size={24} />
                            <span className="truncate">{p.title}</span>
                          </Link>
                        </td>
                        <td className="max-w-52 px-3 py-2.5 text-ink-2">
                          <span className="flex items-center gap-2.5">
                            {logoId ? (
                              // eslint-disable-next-line @next/next/no-img-element -- uploaded logo via public route
                              <img
                                src={`/api/logo/${logoId}`}
                                alt=""
                                className="size-6 shrink-0 rounded-field bg-white object-contain p-0.5"
                              />
                            ) : (
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-field bg-muted text-2xs font-medium text-ink">
                                {p.orgLabel.slice(0, 1)}
                              </span>
                            )}
                            <span className="truncate">{p.orgLabel}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {p.state === 'PUBLISHED' && data.org?.slug ? (
                            <a
                              href={`/careers/${data.org.slug}/${p.slug}`}
                              target="_blank"
                              className={buttonClass({ variant: 'ghost', size: 'xs' })}
                            >
                              <Eye /> Visualização
                            </a>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">
                          {WORKPLACE_LABELS[p.workplaceType] ?? 'Não informada'}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">
                          {COMMITMENT_LABELS[p.commitment] ?? 'Não informado'}
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{p.location ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {data.canEditPostings ? <RequisitionLink
                            postingId={p.id}
                            requisitionId={p.requisitionId}
                            requisitions={data.openReqs}
                          /> : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <PostingStateBadge />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {data.canEditPostings ? <PostingStateMenu /> : null}
                        </td>
                      </tr>
                    </PostingStateScope>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-5 rounded-card border border-line bg-surface px-3 py-2.5">
          <summary className="cursor-pointer font-medium text-sm">Requisições ({data.requisitions.length})</summary>
          <RequisitionsManager requisitions={data.requisitions} />
        </details>
        <div className="pb-8" />
      </div>
    </div>
  );
}
