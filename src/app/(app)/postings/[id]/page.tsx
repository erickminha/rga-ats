import { FinalistsForm } from '@/components/finalists-form';
import { finalistStageNames } from '@/server/share-links';
import { outcomeCategory, outcomeNames } from '@/lib/i18n/pt-BR/recruiting';
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
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Aguardando aprovação', tone: 'caution' },
  PUBLISHED: { label: 'Publicada', tone: 'positive' },
  INTERNAL: { label: 'Interna', tone: 'info' },
  CLOSED: { label: 'Encerrada', tone: 'neutral' },
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
  const scope = { orgId: ctx.orgId, postingId: posting.id, contact: { orgId: ctx.orgId, isAnonymized: false } };
  const [counts, stages, reasons, finalists] = await Promise.all([
    db.opportunity.groupBy({ by: ['status', 'archiveReasonId', 'stageId'], where: scope, _count: true }),
    db.stage.findMany({ where: { orgId: ctx.orgId }, orderBy: { order: 'asc' } }),
    db.archiveReason.findMany({ where: { orgId: ctx.orgId } }),
    db.opportunity.findMany({
      where: { ...scope, status: 'ACTIVE', stage: { orgId: ctx.orgId, name: { in: finalistStageNames } } },
      select: {
        id: true, confidential: true, contact: { select: { name: true, headline: true } },
        stage: { select: { name: true } },
        recruitingAssessment: { select: { disc: true, opinionFinalizedAt: true } },
        interviews: { where: { orgId: ctx.orgId, state: 'COMPLETED' }, take: 1, select: { id: true } },
      },
      orderBy: { contact: { name: 'asc' } },
    }),
  ]);
  const summary = { ACTIVE: 0, HIRED: 0, REJECTION: 0, WITHDRAWAL: 0, ADMINISTRATIVE: 0 };
  const byStage = new Map<string, number>();
  const byReason = new Map(reasons.map((reason) => [reason.id, reason]));
  for (const row of counts) {
    if (row.status === 'ACTIVE') byStage.set(row.stageId, (byStage.get(row.stageId) ?? 0) + row._count);
    summary[row.status === 'ARCHIVED' ? outcomeCategory(byReason.get(row.archiveReasonId ?? '')) : row.status] += row._count;
  }
  const labels = { ACTIVE: 'Ativos', HIRED: 'Contratados', ...outcomeNames };
  const state = STATE_BADGES[posting.state] ?? { label: posting.state, tone: 'neutral' as Tone };
  const criteria = cleanCriteria(posting.matchCriteria);
  const aiOn = aiConfigured();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <Link
        href="/postings"
        className={buttonClass({ variant: 'ghost', size: 'sm', className: '-ml-3 mb-4' })}
      >
        <ArrowLeft /> Vagas
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
            `${posting._count.opportunities} candidaturas`,
            posting.requisition ? `req ${posting.requisition.code}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-medium text-ink-2">Responsável</span>
          {canRecruit ? <RoleOwner inline postingId={posting.id} owner={posting.owner} teammates={teammates} /> : posting.owner?.name ?? 'Sem responsável'}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className={buttonClass({ variant: 'tonal', size: 'sm' })} href={`/pipeline?posting=${posting.id}&view=kanban`}>Abrir funil desta vaga</Link>
          <Link className={buttonClass({ variant: 'ghost', size: 'sm' })} href={`/pipeline?posting=${posting.id}&status=archived`}>Ver participações encerradas</Link>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(summary).map(([key, value]) => <div key={key}>
            <dt className="text-xs text-ink-2">{labels[key as keyof typeof labels]}</dt>
            <dd className="text-xl font-medium">{value.toLocaleString('pt-BR')}</dd>
          </div>)}
        </dl>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm">Candidatos ativos por etapa</summary>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {stages.map((stage) => <li key={stage.id}>{stage.name} · {(byStage.get(stage.id) ?? 0).toLocaleString('pt-BR')}</li>)}
          </ul>
        </details>
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
        {canRecruit ? (
        <div className="mt-6">
          <p className="mb-2 text-xs text-ink-2">
            Compartilhe com o cliente os totais e as etapas do processo seletivo.
          </p>
          <div className="flex flex-wrap gap-2">
            <ShareLinkButton
              scope="posting"
              id={posting.id}
              canCreate={posting.state === 'PUBLISHED'}
              subject={{ name: posting.title, detail: posting.location, seed: posting.id }}
            />
            {linkedClient ? (
              <ShareLinkButton
                scope="client"
                canCreate={linkedClient.active}
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

      <section className={`${surface} my-5 p-5`}>
        <h2 className="mb-3 text-lg font-medium">Finalistas e apresentação ao cliente</h2>
        <FinalistsForm id={posting.id} enabled={posting.state === 'PUBLISHED' && !!linkedClient?.active}
          finalists={finalists.map((row) => ({
            id: row.id, name: row.contact.name, headline: row.contact.headline, stage: row.stage.name,
            interviewed: row.interviews.length > 0, opinionFinal: !!row.recruitingAssessment?.opinionFinalizedAt,
            discComplete: !!row.recruitingAssessment?.disc && typeof row.recruitingAssessment.disc === 'object'
              && !Array.isArray(row.recruitingAssessment.disc) && row.recruitingAssessment.disc.complete === true,
            canShare: !row.confidential,
          }))} />
      </section>
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
            <h2 className={sectionLabel}>Critérios de aderência</h2>
            <MatchCriteriaEditor
              postingId={posting.id}
              postingTitle={posting.title}
              criteria={criteria}
              aiEnabled={aiOn}
              label={criteria.length ? 'Editar critérios' : 'Adicionar critérios'}
            />
          </div>
          <p className="mb-4 text-sm text-ink-2">
            Critérios para avaliar as candidaturas da vaga. Requisitos obrigatórios têm peso duplo.
            {criteria.length ? null : ' With none set, the first evaluation drafts them from the job description.'}
          </p>
          {criteria.length ? (
            <div className="flex flex-wrap gap-1.5">
              {[...criteria.filter((c) => c.must), ...criteria.filter((c) => !c.must)].map((c) => (
                <Badge key={c.id} onCanvas className={c.must ? 'font-medium text-ink' : undefined}>
                  {c.label}
                  {c.must ? <span className="text-ink-3">obrigatório</span> : null}
                </Badge>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {canRecruit ? <section className="mt-8">
        <h2 className={`${sectionLabel} mb-1`}>Roteiro de entrevistas</h2>
        <p className="mb-4 text-sm text-ink-2">
          Organize as etapas da entrevista. Ao agendar por uma etapa, o formulário e o kit usam os temas definidos no roteiro.
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
