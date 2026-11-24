import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { canManageRecruiting, requireSession } from '@/lib/session';
import { firstParams, type SearchParams } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { NewPostingForm } from '@/components/new-posting-form';

export default async function NewPostingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireSession();
  if (!canManageRecruiting(ctx)) notFound();
  const org = await db.organization.findUnique({
    where: { id: ctx.orgId },
    include: {
      departments: { orderBy: { name: 'asc' } },
      clientCompanies: { where: { active: true }, orderBy: { name: 'asc' } },
    },
  });
  const isAgency = org?.kind === 'AGENCY';
  const groups = (isAgency ? org?.clientCompanies : org?.departments) ?? [];

  const { client } = await firstParams(searchParams);
  const initialClientId = isAgency && groups.some((group) => group.id === client) ? client : undefined;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Nova vaga" subtitle="Rascunhos ficam privados até a publicação." />
      <div className="mx-6 mb-8 mt-4 rounded-card bg-surface p-5">
        <NewPostingForm
          isAgency={isAgency}
          initialClientId={initialClientId}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        />
      </div>
    </div>
  );
}
