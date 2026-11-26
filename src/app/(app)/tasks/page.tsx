import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadTasksPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { TasksScreen } from './screen';

export const metadata = { title: navigation.tasks };

type Params = {situacao?:string;responsavel?:string;busca?:string;pagina?:string};
async function TasksContent({searchParams}:{searchParams:Promise<Params>}) {
  return <TasksScreen data={await loadTasksPage(await searchParams)} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function TasksPage({searchParams}:{searchParams:Promise<Params>}) {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.tasks} subtitle={navigation.loadingSubtitles.tasks} />}>
      <TasksContent searchParams={searchParams} />
    </Suspense>
  );
}
