import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { PageSkeleton } from '@/components/page-skeleton';

export default function Loading() {
  return <PageSkeleton title={navigation.reports} subtitle={navigation.loadingSubtitles.reports} />;
}
