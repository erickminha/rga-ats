import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { PageSkeleton } from '@/components/page-skeleton';

// The same chrome the page streams first, so entering /pipeline doesn't swap
// a full-screen message for a skeleton and then for the list.
export default function Loading() {
  return <PageSkeleton title={navigation.pipeline} subtitle={navigation.loadingSubtitles.pipeline} />;
}
