import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { settings } from '@/lib/i18n/pt-BR/settings';
import { PageSkeleton } from '@/components/page-skeleton';

export default function Loading() {
  return <PageSkeleton title={navigation.settings} subtitle={settings.subtitle} />;
}
