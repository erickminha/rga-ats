import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadPostingsPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { firstParams, type SearchParams } from '@/lib/utils';
import { PostingsScreen } from './screen';

export const metadata = { title: navigation.postings };

async function PostingsContent({ searchParams }: { searchParams: SearchParams }) {
  return <PostingsScreen data={await loadPostingsPage(await firstParams(searchParams))} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function PostingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.postings} subtitle={navigation.loadingSubtitles.postings} />}>
      <PostingsContent searchParams={searchParams} />
    </Suspense>
  );
}
