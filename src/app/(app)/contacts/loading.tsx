import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { PageSkeleton } from '@/components/page-skeleton';

// The same chrome the page streams first, so entering /contacts doesn't swap
// a full-screen message for a skeleton and then for the list.
export default function Loading() {
  return <PageSkeleton title={navigation.contacts} subtitle={navigation.loadingSubtitles.contacts} />;
}
