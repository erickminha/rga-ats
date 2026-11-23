import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadInterviewsPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { InterviewsScreen } from './screen';

export const metadata = { title: navigation.interviews };

async function InterviewsContent() {
  return <InterviewsScreen data={await loadInterviewsPage()} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function InterviewsPage() {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.interviews} subtitle={navigation.loadingSubtitles.interviews} />}>
      <InterviewsContent />
    </Suspense>
  );
}
