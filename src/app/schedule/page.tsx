import { CapabilityEntry } from '@/components/capability-entry';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function EntryPage() {
  return <CapabilityEntry kind="schedule" />;
}
