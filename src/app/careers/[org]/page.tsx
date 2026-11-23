import type { Metadata } from 'next';
import { jobBoard } from '@/lib/i18n/pt-BR/job-board';
import { db } from '@/lib/db';
import { JobBoard } from '@/components/job-board';
import { knownFilters, readBoardFilters, type BoardPosting } from '@/lib/job-board';
import { careersPath, noIndex, publicClientName } from '@/lib/public-careers';
import { careersOrganization, careersOrigin, isDemoCareers, publicClientSelect } from '@/server/public-careers';

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await careersOrganization(slug);
  if (!org) return { robots: noIndex };
  const title = `Oportunidades de carreira | ${org.name}`;
  const description = `Confira as vagas disponíveis em ${org.name} e candidate-se pelo portal.`;
  const url = new URL(careersPath(org.slug), await careersOrigin()).href;
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { title, description, url, locale: 'pt_BR' },
    ...(isDemoCareers(org.slug) && { robots: noIndex }),
  };
}

export default async function CareersPage({ params, searchParams }: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org: orgSlug } = await params;
  const org = await careersOrganization(orgSlug);
  if (!org) return null;

  const postings = await db.posting.findMany({
    where: { orgId: org.id, state: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, orgId: true, slug: true, title: true, location: true, workplaceType: true, commitment: true, content: true,
      department: { select: { name: true, orgId: true } },
      clientCompany: { select: publicClientSelect },
    },
  });
  const isAgency = org.kind === 'AGENCY';
  const fallbackGroup = isAgency ? 'Other clients' : 'Other roles';
  const board: BoardPosting[] = postings.map((p) => {
    const department = p.department?.orgId === org.id ? p.department.name : undefined;
    const group = isAgency ? publicClientName(p) : department;
    return {
      id: p.id, slug: p.slug, title: p.title, location: p.location, workplaceType: p.workplaceType, commitment: p.commitment,
      group: group ?? fallbackGroup,
      groupLabel: group ? undefined : jobBoard.otherRoles,
      ...(isAgency && department ? { area: department } : {}),
    };
  });
  const groupKey = isAgency ? 'client' : 'team';

  return (
    <>
      <section className="mb-6 rounded-card border border-line bg-surface px-5 py-8 sm:px-9 sm:py-12">
        <div className="mb-4 h-1 w-12 rounded-full bg-[var(--careers-accent)]" aria-hidden="true" />
        <h1 className="max-w-2xl break-words text-3xl font-semibold tracking-tight sm:text-5xl">{jobBoard.title}</h1>
        <p className="mt-3 max-w-prose text-sm text-ink-2 sm:text-md">Explore as vagas disponíveis e envie sua candidatura pelo portal.</p>
      </section>
      <JobBoard orgSlug={orgSlug} postings={board} groupKey={groupKey}
        groupLabel={isAgency ? jobBoard.company : jobBoard.team}
        initial={knownFilters(board, readBoardFilters(await searchParams, groupKey))} />
    </>
  );
}
