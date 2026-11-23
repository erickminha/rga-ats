import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadSearchPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { firstParams, type SearchParams } from '@/lib/utils';
import { SearchScreen } from './screen';

export const metadata = { title: navigation.search };

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await firstParams(searchParams);
  return <SearchScreen data={await loadSearchPage(q ?? '')} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.search} subtitle={navigation.loadingSubtitles.search} />}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  );
}
