import { organization } from '@/lib/i18n/pt-BR/organization';
import { db } from '@/lib/db';
import { JobBoard } from '@/components/job-board';
import { knownFilters, readBoardFilters, type BoardPosting } from '@/lib/job-board';

export default async function CareersPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: orgSlug } = await params;
  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return null; // layout already 404s

  const postings = await db.posting.findMany({
    where: { orgId: org.id, state: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      location: true,
      workplaceType: true,
      commitment: true,
      department: { select: { name: true } },
      clientCompany: { select: { name: true } },
    },
  });

  const isAgency = org.kind === 'AGENCY';
  const fallbackGroup = isAgency ? 'Other clients' : 'Other roles';
  const fallbackLabel = isAgency ? organization.client.other : 'Outras vagas';
  const board: BoardPosting[] = postings.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    location: p.location,
    workplaceType: p.workplaceType,
    commitment: p.commitment,
    group: (isAgency ? p.clientCompany?.name : p.department?.name) ?? fallbackGroup,
    groupLabel: (isAgency ? p.clientCompany : p.department) ? undefined : fallbackLabel,
  }));
  const groupKey = isAgency ? 'client' : 'team';

  return (
    <div>
      <h1 className="text-3xl">Vagas abertas</h1>
      {board.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">Nenhuma vaga aberta no momento. Volte em breve.</p>
      ) : (
        <JobBoard
          orgSlug={orgSlug}
          postings={board}
          groupKey={groupKey}
          groupLabel={isAgency ? organization.client.singular : 'Equipe'}
          initial={knownFilters(board, readBoardFilters(await searchParams, groupKey))}
        />
      )}
    </div>
  );
}
