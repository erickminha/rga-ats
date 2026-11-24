import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, Plus, Search } from 'lucide-react';
import { appLocale } from '@/lib/i18n';
import { maskCnpj } from '@/lib/client-company';
import { requireSession } from '@/lib/session';
import { firstParams, type SearchParams } from '@/lib/utils';
import { canViewClientCompanies, listClientCompanies } from '@/server/client-companies';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { inputClass, selectClass, surface } from '@/components/form-controls';
import { Badge } from '@/components/ui/primitives';
import { buttonClass } from '@/components/ui/button';

export const metadata = { title: 'Empresas clientes' };
const number = new Intl.NumberFormat(appLocale);

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireSession();
  if (!await canViewClientCompanies(ctx)) notFound();
  const data = await listClientCompanies(ctx, await firstParams(searchParams));
  const href = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (data.q) params.set('q', data.q);
    if (data.status) params.set('status', data.status);
    if (data.segment) params.set('segment', data.segment);
    return `/clients?${params}`;
  };
  return (
    <>
      <PageHeader title="Empresas clientes" subtitle="Consulte os clientes da agência e as vagas vinculadas." />
      <div className="mx-6 mt-4 grid max-w-5xl gap-5 pb-8">
        <Link href="/clients/new" className={buttonClass({ variant: 'primary', className: 'justify-self-start ring-2 ring-[#1581c9] ring-offset-2' })}>
          <Plus /> Cadastrar empresa
        </Link>

        <form action="/clients" method="get" className={`${surface} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]`}>
          <label className="grid gap-1.5 text-sm">
            Buscar empresa
            <input name="q" type="search" defaultValue={data.q} className={inputClass} placeholder="Nome, CNPJ ou cidade" />
          </label>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="filter-status">Situação</label>
            <select id="filter-status" name="status" defaultValue={data.status} className={selectClass}>
              <option value="">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option>
            </select>
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="filter-segment">Segmento</label>
            <select id="filter-segment" name="segment" defaultValue={data.segment} className={selectClass}>
              <option value="">Todos</option>
              {data.segments.map((segment) => <option value={segment} key={segment}>{segment}</option>)}
            </select>
          </div>
          <button type="submit" className={buttonClass({ variant: 'tonal', className: 'self-end' })}>
            <Search /> Aplicar filtros
          </button>
        </form>
        {data.q || data.status || data.segment ? (
          <Link href="/clients" className="justify-self-start text-sm underline underline-offset-2">Limpar filtros</Link>
        ) : null}
        <p role="status" className="text-sm text-ink-2">
          {number.format(data.total)} {data.total === 1 ? 'empresa encontrada' : 'empresas encontradas'}
        </p>
        {!data.rows.length ? (
          <EmptyState icon={Building2} title="Nenhuma empresa encontrada"
            description={data.q || data.status || data.segment ? 'Altere a busca ou limpe os filtros.' : 'As empresas cadastradas aparecerão aqui.'} />
        ) : (
          <ul className={`${surface} divide-y divide-line`}>
            {data.rows.map((client) => (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-card px-4 py-3 hover:bg-muted focus-visible:is-focused">
                  <div className="min-w-0 break-words">
                    <p className="text-sm font-medium">{client.name}</p>
                    {client.legalName && client.legalName !== client.name ? <p className="text-xs text-ink-2">{client.legalName}</p> : null}
                    <p className="text-xs text-ink-2">
                      {[client.cnpj && maskCnpj(client.cnpj), [client.city, client.state].filter(Boolean).join(' / '), client.segment].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge tone={client.active ? 'positive' : 'neutral'}>{client.active ? 'Ativa' : 'Inativa'}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data.pages > 1 ? (
          <nav aria-label="Páginas de empresas" className="flex flex-wrap items-center gap-3 text-sm">
            {data.page > 1 ? <Link href={href(data.page - 1)} className="underline">Anterior</Link> : null}
            <span>Página {number.format(data.page)} de {number.format(data.pages)}</span>
            {data.page < data.pages ? <Link href={href(data.page + 1)} className="underline">Próxima</Link> : null}
          </nav>
        ) : null}
      </div>
    </>
  );
}
