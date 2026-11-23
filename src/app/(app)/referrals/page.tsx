import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { Suspense } from 'react';
import { loadReferralsPage } from '@/app/(app)/page-loaders';
import { PageSkeleton } from '@/components/page-skeleton';
import { ReferralsScreen } from './screen';

export const metadata = { title: navigation.referrals };

async function ReferralsContent() {
  return <ReferralsScreen data={await loadReferralsPage()} />;
}

// The header + skeleton stream immediately; the data follows in the same response.
export default function ReferralsPage() {
  return (
    <Suspense fallback={<PageSkeleton title={navigation.referrals} subtitle={navigation.loadingSubtitles.referrals} />}>
      <ReferralsContent />
    </Suspense>
  );
}
