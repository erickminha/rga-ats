import { NewPostingForm } from '@/components/new-posting-form';
import { publicClientName, publicPostingText } from '@/lib/public-careers';
import { organization } from '@/lib/i18n/pt-BR/organization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canViewClientCompanies } from '@/server/client-companies';
import { PostingClientForm, PublicClientIdentityForm } from '@/components/client-company-form';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, requireSession } from '@/lib/session';
import { PlanEditor } from '@/components/plan-editor';
import { ShareLinkButton } from '@/components/share-link-button';
import { sectionLabel, surface } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Orb } from '@/components/ui/orb';
import { Badge, type Tone } from '@/components/ui/primitives';
import { removePostingLogoAction, uploadPostingLogoAction } from '@/app/org-actions';
import { LogoUpload } from '@/components/logo-upload';
import { RoleOwner } from '@/components/role-owner';
import { MatchCriteriaEditor } from '@/components/match-criteria-editor';
import { cleanCriteria } from '@/lib/match-criteria';
import { aiConfigured } from '@/server/ai';

const STATE_BADGES: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Pending approval', tone: 'caution' },
  PUBLISHED: { label: 'Published', tone: 'positive' },
  INTERNAL: { label: 'Internal', tone: 'info' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export default async function PostingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const [posting, teammates] = await Promise.all([
    db.posting.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      department: true,
      clientCompany: { select: { id: true, name: true, active: true, orgId: true } },
      requisition: true,
      org: { select: { requirePostingApproval: true } },
      planSteps: { orderBy: { order: 'asc' } },
      _count: { select: { opportunities: true } },
    },
    }),
    db.user.findMany({
      where: { orgId: ctx.orgId, deactivatedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!posting) notFound();
  const canRecruit = canManageRecruiting(ctx);
  const canEditDetails = canRecruit && (posting.state !== 'PUBLISHED' || !posting.org.requirePostingApproval || isAdmin(ctx));
  const canManageClient = await canViewClientCompanies(ctx);
  const linkedClient = posting.clientCompany?.orgId === ctx.orgId ? posting.clientCompany : null;
  const choices = canManageClient ? await db.clientCompany.findMany({
    where: { orgId: ctx.orgId, OR: [{ active: true }, ...(linkedClient ? [{ id: linkedClient.id }] : [])] },
    orderBy: { name: 'asc' }, select: { id: true, name: true, active: true },
  }) : [];
  const state = STATE_BADGES[posting.state] ?? { label: posting.state, tone: 'neutral' as Tone };
  const criteria = cleanCriteria(posting.matchCriteria);
  const aiOn = aiConfigured();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <Link
        href="/postings"
        className={buttonClass({ variant: 'ghost', size: 'sm', className: '-ml-3 mb-4' })}
      >
        <ArrowLeft /> Postings
      </Link>

      <div className={`${surface} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <Orb seed={posting.id} size={40} />
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <h1 className="mt-5 text-xl font-medium text-ink">{posting.title}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {[
            linkedClient?.name ?? posting.department?.name,
            posting.location,
            `${posting._count.opportunities} candidate(s)`,
            posting.requisition ? `req ${posting.requisition.code}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-medium text-ink-2">Recruiter</span>
          {canRecruit ? <RoleOwner inline postingId={posting.id} owner={posting.owner} teammates={teammates} /> : posting.owner?.name ?? 'Sem responsável'}
        </div>
        {canManageClient ? (
          <div className="mt-6 grid gap-2">
            {linkedClient ? (
              <Link href={`/clients/${linkedClient.id}`} className="justify-self-start text-sm underline underline-offset-2">
                Ver empresa cliente: {linkedClient.name}
              </Link>
            ) : null}
            {canEditDetails ? <PostingClientForm key={posting.clientCompanyId ?? 'unassigned'} postingId={posting.id} clientId={linkedClient?.id ?? null} choices={choices} /> : null}
          </div>
        ) : null}
        {canRecruit ? <div className="mt-6">
          {canEditDetails ? <LogoUpload
            logoFileId={posting.logoFileId}
            upload={uploadPostingLogoAction.bind(null, posting.id)}
            remove={removePostingLogoAction.bind(null, posting.id)}
            label={posting.clientCompanyId ? 'Logotipo do cliente' : 'Logotipo da vaga'}
          /> : null}
          {canManageClient && linkedClient && isAdmin(ctx) ? <div className="mt-3">
            <PublicClientIdentityForm key={linkedClient.id} postingId={posting.id} clientId={linkedClient.id} allowed={!!publicClientName(posting)} />
          </div> : null}
        </div> : null}
        {canRecruit && posting.state === 'PUBLISHED' ? (
        <div className="mt-6">
          <p className="mb-2 text-xs text-ink-2">
            Compartilhe com o cliente um link de consulta com os nomes dos candidatos e suas etapas. Anotações, avaliações e remuneração ficam privadas.
          </p>
          <div className="flex flex-wrap gap-2">
            <ShareLinkButton
              scope="posting"
              id={posting.id}
              subject={{ name: posting.title, detail: posting.location, seed: posting.id }}
            />
            {linkedClient?.active ? (
              <ShareLinkButton
                scope="client"
                id={linkedClient.id}
                label={`Todas as vagas de ${linkedClient?.name ?? organization.client.singular}`}
                subject={{
                  name: linkedClient?.name ?? organization.client.singular,
                  detail: 'Todas as vagas',
                  seed: linkedClient.id,
                }}
              />
            ) : null}
          </div>
        </div>
        ) : null}
      </div>

      {canEditDetails ? (
        <details className={`${surface} mt-6 p-5`}>
          <summary className="cursor-pointer text-sm font-medium">Editar dados da vaga</summary>
          <div className="mt-4">
            <NewPostingForm initialPosting={{
              id: posting.id,
              title: posting.title,
              location: posting.location,
              workplaceType: posting.workplaceType,
              commitment: posting.commitment,
              salaryMin: posting.salaryMin,
              salaryMax: posting.salaryMax,
              salaryCurrency: posting.salaryCurrency,
              description: publicPostingText(posting.content).description,
            }} />
          </div>
        </details>
      ) : null}

      {aiOn && canRecruit ? (
        <section className="mt-8">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className={sectionLabel}>Match criteria</h2>
            <MatchCriteriaEditor
              postingId={posting.id}
              postingTitle={posting.title}
              criteria={criteria}
              aiEnabled={aiOn}
              label={criteria.length ? 'Edit criteria' : 'Add criteria'}
            />
          </div>
          <p className="mb-4 text-sm text-ink-2">
            What every candidate for this role is scored on; must-haves count double.
            {criteria.length ? null : ' With none set, the first evaluation drafts them from the job description.'}
          </p>
          {criteria.length ? (
            <div className="flex flex-wrap gap-1.5">
              {[...criteria.filter((c) => c.must), ...criteria.filter((c) => !c.must)].map((c) => (
                <Badge key={c.id} onCanvas className={c.must ? 'font-medium text-ink' : undefined}>
                  {c.label}
                  {c.must ? <span className="text-ink-3">must-have</span> : null}
                </Badge>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {canRecruit ? <section className="mt-8">
        <h2 className={`${sectionLabel} mb-1`}>Interview plan</h2>
        <p className="mb-4 text-sm text-ink-2">
          The interview sequence this role expects. Scheduling from a step pre-fills the interview
          and carries its focus areas onto the interviewer kit.
        </p>
        <PlanEditor
          postingId={posting.id}
          steps={posting.planSteps.map((s) => ({
            id: s.id,
            title: s.title,
            durationMins: s.durationMins,
            focusAreas: s.focusAreas,
          }))}
        />
      </section> : null}
    </div>
  );
}
