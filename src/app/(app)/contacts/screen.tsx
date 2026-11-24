import Link from 'next/link';
import { Plus, SlidersHorizontal } from 'lucide-react';
import type { loadContactsPage } from '@/app/(app)/page-loaders';
import { createTalentPoolAction } from '@/app/(app)/actions';
import { PageHeader } from '@/components/page-header';
import { ContactsNavProvider } from '@/components/contacts-nav';
import { ContactsRail } from '@/components/contacts-rail';
import { ContactsSearch } from '@/components/contacts-search';
import { ContactsTable } from '@/components/contacts-table';
import { btnPrimary, inputClass, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';

export function ContactsScreen({ data }: { data: Awaited<ReturnType<typeof loadContactsPage>> }) {
  // No key on the table: switching pool, tag or search updates it in place
  // and it resets its own selection and loaded pages.
  return (
    <ContactsNavProvider listInput={{ pool: data.poolId, tag: data.tag, q: data.q }}>
      <div className="t-reveal flex h-screen flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
          <PageHeader title="Banco de talentos" subtitle="Contatos cadastrados no banco de talentos" />
          <Link href="/contacts/new" className={`${btnPrimary} mt-6`}>
            <Plus /> Novo profissional
          </Link>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden px-6 pb-6">
          <aside className="hidden w-56 shrink-0 overflow-y-auto pt-2 md:block">
            <ContactsRail pools={data.pools} counts={data.poolCounts} />

            <form action={createTalentPoolAction} className="mt-6 flex flex-col gap-2">
              <input type="hidden" name="q" value={data.q} />
              <input type="hidden" name="tag" value={data.tag} />
              <input {...noAutofill}
                name="name"
                required
                placeholder={data.q || data.tag ? 'Salvar busca como segmento…' : 'Nome do novo grupo…'}
                className={`${inputClass} h-8`}
              />
              <button type="submit" className={buttonClass({ variant: 'ghost', size: 'xs', className: 'self-start' })}>
                {data.q || data.tag ? '+ Salvar segmento' : '+ Criar grupo'}
              </button>
            </form>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-2">
            <Link href="/contacts/busca" className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mb-3 self-start' })}><SlidersHorizontal /> Filtros avançados e busca por perfil</Link>
            <ContactsSearch />
            <ContactsTable
              page={data.page}
              after={data.after}
              total={data.total}
              staticPools={data.staticPools}
              currentPoolId={data.currentPoolId}
              currentPoolStatic={data.currentPoolStatic}
            />
          </div>
        </div>
      </div>
    </ContactsNavProvider>
  );
}
