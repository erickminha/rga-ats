import { TalentProfileForm } from '@/components/talent-profile-form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { canManageRecruiting, requireSession } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { NewCandidateForm } from '@/components/new-candidate-form';

export default async function NewCandidatePage({ searchParams }: { searchParams: Promise<{ mode?: string; posting?: string; stage?: string }> }) {
  const ctx = await requireSession();
  if (!canManageRecruiting(ctx)) notFound();
  const query = await searchParams;
  if (query.mode !== 'application') return (
    <div className="max-w-3xl px-6 pb-8">
      <PageHeader title="Cadastrar profissional" subtitle="Adicione o contato ao banco de talentos." />
      <div className="rounded-card bg-surface p-5"><TalentProfileForm /></div>
      <Link href="/contacts/new?mode=application" className="mt-4 inline-block underline">Cadastrar com participação em uma vaga</Link>
    </div>
  );
  const [stages, postings] = await Promise.all([
    db.stage.findMany({ where: { orgId: ctx.orgId, type: { not: 'HIRED' } }, orderBy: { order: 'asc' } }),
    db.posting.findMany({
      where: { orgId: ctx.orgId, state: { not: 'CLOSED' } },
      orderBy: { title: 'asc' },
      include: { clientCompany: true },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Novo candidato"
        subtitle="Cadastre o contato e vincule-o a uma etapa do funil."
      />
      <div className="mx-6 mb-8 mt-2 rounded-card bg-surface p-5">
        <NewCandidateForm
          initialPosting={postings.find((posting) => posting.id === query.posting)?.id}
          initialStage={stages.find((stage) => stage.id === query.stage)?.id}
          stages={stages.map((s) => ({ id: s.id, name: s.name }))}
          postings={postings.map((p) => ({
            id: p.id,
            title: p.clientCompany ? `${p.title} — ${p.clientCompany.name}` : p.title,
          }))}
        />
      </div>
    </div>
  );
}
