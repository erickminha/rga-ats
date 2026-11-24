import Link from 'next/link';
import { notFound } from 'next/navigation';
import { appLocale } from '@/lib/i18n';
import { companyFields, maskCnpj, maskPhone, maskPostalCode, postingStates } from '@/lib/client-company';
import { requireSession } from '@/lib/session';
import { firstParams, type SearchParams } from '@/lib/utils';
import { canViewClientCompanies, clientPostingHistory, getClientCompany } from '@/server/client-companies';
import { CommercialContactForm } from '@/components/client-company-form';
import { surface } from '@/components/form-controls';
import { Badge } from '@/components/ui/primitives';
import { buttonClass } from '@/components/ui/button';

const day = new Intl.DateTimeFormat(appLocale, { timeZone: 'America/Sao_Paulo', dateStyle: 'short' });
const number = new Intl.NumberFormat(appLocale);

export default async function ClientDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: SearchParams;
}) {
  const ctx = await requireSession();
  if (!await canViewClientCompanies(ctx)) notFound();
  const { id } = await params;
  const client = await getClientCompany(ctx, id);
  if (!client) notFound();
  const { page } = await firstParams(searchParams);
  const history = await clientPostingHistory(ctx, client.id, page);
  const clientPath = `/clients/${client.id}`;
  const rows = [
    ['legalName', client.legalName], ['cnpj', client.cnpj && maskCnpj(client.cnpj)],
    ['stateRegistration', client.stateRegistration], ['segment', client.segment], ['size', client.size],
    ['responsibleName', client.responsibleName], ['responsibleRole', client.responsibleRole],
    ['phone', client.phone && maskPhone(client.phone)], ['secondaryPhone', client.secondaryPhone && maskPhone(client.secondaryPhone)],
    ['whatsapp', client.whatsapp && maskPhone(client.whatsapp)], ['channels', client.channels],
    ['email', client.email], ['website', client.website], ['postalCode', client.postalCode && maskPostalCode(client.postalCode)],
    ['address', client.address], ['city', client.city], ['state', client.state], ['source', client.source],
    ['notes', client.notes],
  ] as const;
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-6 py-6">
      <Link href="/clients" className="justify-self-start text-sm underline underline-offset-2">Todas as empresas</Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 break-words">
          <h1 className="text-xl font-medium">{client.name}</h1>
          <Badge tone={client.active ? 'positive' : 'neutral'}>{client.active ? 'Ativa' : 'Inativa'}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {client.active ? <Link href={`/postings/new?client=${encodeURIComponent(client.id)}`} className={buttonClass({ variant: 'tonal' })}>Criar vaga vinculada</Link> : null}
          <Link href={clientPath + '/edit'} className={buttonClass({ variant: 'tonal' })}>Editar empresa</Link>
        </div>
      </header>
      <section aria-labelledby="client-data" className={`${surface} p-4 sm:p-5`}>
        <h2 id="client-data" className="mb-3 text-md font-medium">Dados da empresa</h2>
        <dl className="grid min-w-0 gap-3 break-words text-sm sm:grid-cols-2">
          <div><dt className="text-ink-2">Data do cadastro</dt><dd>{client.createdAt ? day.format(client.createdAt) : 'Não registrada'}</dd></div>
          {rows.map(([key, value]) => value ? (
            <div key={key} className={key === 'notes' ? 'sm:col-span-2' : undefined}>
              <dt className="text-ink-2">{companyFields[key]}</dt>
              <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ) : null)}
        </dl>
      </section>
      <section aria-labelledby="client-contacts" className={`${surface} p-4 sm:p-5`}>
        <h2 id="client-contacts" className="mb-3 text-md font-medium">Contatos comerciais</h2>
        {client.commercialContacts.length ? (
          <ul className="divide-y divide-line">
            {client.commercialContacts.map((contact) => (
              <li key={contact.id} className="py-2 [overflow-wrap:anywhere]">
                <p className="text-sm font-medium">{contact.name}</p>
                <p className="text-xs text-ink-2">
                  {[contact.role, contact.phone && maskPhone(contact.phone), contact.whatsapp && `WhatsApp: ${maskPhone(contact.whatsapp)}`, contact.email].filter(Boolean).join(' · ')}
                </p>
                <details className="mt-2"><summary className="cursor-pointer text-sm underline">Editar contato de {contact.name}</summary>
                  <CommercialContactForm clientId={client.id} contact={contact} />
                </details>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-2">Nenhum contato comercial cadastrado.</p>}
        <details className="mt-3"><summary className="cursor-pointer text-sm underline">Adicionar contato comercial</summary>
          <CommercialContactForm clientId={client.id} />
        </details>
      </section>
      <section aria-labelledby="client-postings" className={`${surface} grid gap-3 p-4 sm:p-5`}>
        <h2 id="client-postings" className="text-md font-medium">Histórico de vagas</h2>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ['Abertas ao público', history.open], ['Encerradas', history.closed], ['Com processos ativos', history.withActiveProcesses],
          ].map(([label, value]) => <div key={label} className="rounded-field border-l-2 border-[#1581c9] bg-muted p-3">
            <dt className="text-xs text-ink-2">{label}</dt><dd className="text-lg font-medium">{number.format(Number(value))}</dd>
          </div>)}
        </dl>
        <p className="text-xs text-ink-2">Uma vaga pode aparecer em mais de um indicador.</p>
        {history.postings.length ? (
          <ul className="divide-y divide-line">
            {history.postings.map((posting) => (
              <li key={posting.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 break-words">
                  <Link href={`/postings/${posting.id}`} className="text-sm font-medium underline underline-offset-2">{posting.title}</Link>
                  <p className="text-xs text-ink-2">{postingStates[posting.state]} · {day.format(posting.createdAt)}</p>
                </div>
                <Link href={`/pipeline?posting=${encodeURIComponent(posting.id)}`} aria-label={`Ver processo seletivo de ${posting.title}`}
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}>Ver processo</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-2">Nenhuma vaga vinculada a esta empresa.</p>}
        {history.previous.length ? (
          <div className="border-t border-line pt-3">
            <h3 className="text-sm font-medium">Alterações recentes de vínculo</h3>
            <ul className="mt-2 grid gap-2 text-sm">
              {history.previous.map((change) => (
                <li key={change.id} className="flex flex-wrap gap-x-2">
                  {change.title ? <Link href={`/postings/${change.subjectId}`} className="underline">{change.title}</Link> : <span>Vaga indisponível</span>}
                  <span className="text-ink-2">Vínculo encerrado em {day.format(change.occurredAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {history.pages > 1 ? <nav className="flex flex-wrap gap-3 text-sm" aria-label="Páginas do histórico">
          {history.page > 1 ? <Link className="underline" href={`${clientPath}?page=${history.page - 1}`}>Anterior</Link> : null}
          <span>Página {number.format(history.page)} de {number.format(history.pages)}</span>
          {history.page < history.pages ? <Link className="underline" href={`${clientPath}?page=${history.page + 1}`}>Próxima</Link> : null}
        </nav> : null}
      </section>
    </div>
  );
}
