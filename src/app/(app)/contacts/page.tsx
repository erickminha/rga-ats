import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadContactsPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { firstParams, type SearchParams } from '@/lib/utils';
import { ContactsScreen } from './screen';

export const metadata = { title: navigation.contacts };

async function ContactsContent({ searchParams }: { searchParams: SearchParams }) {
  return <ContactsScreen data={await loadContactsPage(await firstParams(searchParams))} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.contacts} subtitle={navigation.loadingSubtitles.contacts} />}>
      <div className="px-4 pt-3"><Link href="/contacts/sincronizar" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        Sincronizar banco de talentos
      </Link></div>
      <ContactsContent searchParams={searchParams} />
    </Suspense>
  );
}
