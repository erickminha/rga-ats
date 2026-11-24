import { notFound } from 'next/navigation';
import { shareableOpportunity } from '@/server/share-links';
import { db } from '@/lib/db';
import { Avatar } from '@/components/ui/orb';

export async function CandidatePresentation({ orgId, opportunityId }: { orgId: string; opportunityId: string }) {
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, ...shareableOpportunity(orgId) },
    select: { contact: { select: { id: true, name: true } }, posting: { select: { title: true } } },
  });
  if (!opportunity) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <div className="flex items-center gap-4">
        <Avatar name={opportunity.contact.name} seed={opportunity.contact.id} size={56} />
        <div>
          <h1 className="text-2xl text-ink">{opportunity.contact.name}</h1>
          {opportunity.posting ? <p className="mt-1 text-sm text-ink-2">{opportunity.posting.title}</p> : null}
        </div>
      </div>
    </main>
  );
}
