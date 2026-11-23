import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadTasksPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { TasksScreen } from './screen';

export const metadata = { title: navigation.tasks };

async function TasksContent() {
  return <TasksScreen data={await loadTasksPage()} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function TasksPage() {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.tasks} subtitle={navigation.loadingSubtitles.tasks} />}>
      <TasksContent />
    </Suspense>
  );
}
