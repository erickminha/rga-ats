import { saveArchiveReasonAction, seedRgaArchiveReasonsAction, translateRgaEmailDefaultsAction } from '@/app/org-actions';
import { outcomeCategory, outcomeNames } from '@/lib/i18n/pt-BR/recruiting';
import { organization } from '@/lib/i18n/pt-BR/organization';
import { settings } from '@/lib/i18n/pt-BR/settings';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isRgaWorkspace } from '@/server/rga-workspace';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, requireSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { StageManager } from '@/components/stage-manager';
import { GroupManager } from '@/components/group-manager';
import { TemplateManager } from '@/components/template-manager';
import { AutomationSettings } from '@/components/automation-settings';
import { TalentNetworkToggle } from '@/components/talent-network-toggle';
import { ApiKeysManager } from '@/components/api-keys-manager';
import { WebhooksManager } from '@/components/webhooks-manager';
import { ResumeParsingStatus } from '@/components/resume-parsing-status';
import { CsvImport } from '@/components/csv-import';
import { FeedbackVisibilityToggle } from '@/components/feedback-visibility-toggle';
import { TeamManager } from '@/components/team-manager';
import { CustomFieldsManager } from '@/components/custom-fields-manager';
import { EeoToggle } from '@/components/eeo-toggle';
import { PostingApprovalToggle } from '@/components/posting-approval-toggle';
import { SettingsSwitch } from '@/components/settings-switch';
import { NotetakerConnections } from '@/components/notetaker-connections';
import { myNotetakerConnections, orgNotetakerOverview, suggestedMeetingCount } from '@/server/notetakers/connections';
import { EEOEnabled, talentNetworkAllowed } from '@/server/privacy-options';
import { isDemoOrg } from '@/server/notetakers/sync';
import {
  addScorecardQuestionAction,
  archiveScorecardQuestionAction,
  removeOrgLogoAction,
  saveRetentionAction,
  setAutoScheduleOnInterviewStagesAction,
  setRequireOfferApprovalAction,
  uploadOrgLogoAction,
} from '@/app/org-actions';
import { LogoUpload } from '@/components/logo-upload';
import { BrandKitEditor } from '@/components/brand-kit-editor';
import { readBrand } from '@/lib/brand';
import { googleAuthEnabled } from '@/server/google-auth';
import { badge, btnPrimary, btnTonal, inputClass, selectClass, surface, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/primitives';

export const metadata = { title: settings.title };

/** A settings group: a quiet label on the canvas above one white card of rows. */
function Group({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={id ? 'scroll-mt-16' : undefined}>
      <SectionHeader title={title} />
      <div className={`${surface} divide-y divide-line`}>{children}</div>
    </section>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}

/** Description on the left, its control on the right (stacks on mobile). */
function ControlRow({ description, children }: { description: React.ReactNode; children: React.ReactNode }) {
  return (
    <Row className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="max-w-prose text-sm text-ink-2">{description}</p>
      <div className="shrink-0">{children}</div>
    </Row>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; notetaker?: string; provider?: string }>;
}) {
  const ctx = await requireSession();
  const { section = 'business', notetaker, provider: notetakerProviderId } = await searchParams;
  const admin = isAdmin(ctx);
  const adminSections = ['hiring', 'team', 'email'];
  const canImportContacts = canManageRecruiting(ctx);
  if ((!admin && adminSections.includes(section)) || (section === 'data' && !canImportContacts)) redirect('/settings');
  const notetakers =
    section === 'integrations'
      ? await Promise.all([
          myNotetakerConnections(ctx),
          isAdmin(ctx) ? orgNotetakerOverview(ctx) : Promise.resolve(null),
          isDemoOrg(ctx.orgId),
          suggestedMeetingCount(ctx),
        ])
      : null;

  const [org, members, stages, archiveReasons, templates, apiKeys, webhooks, fieldDefs, scorecardQuestions] = await Promise.all([
    db.organization.findUnique({
      where: { id: ctx.orgId },
      include: {
        departments: { orderBy: { name: 'asc' } },
        clientCompanies: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } },
      },
    }),
    admin ? db.user.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, accessRole: true, deactivatedAt: true },
    }) : Promise.resolve([]),
    db.stage.findMany({ where: { orgId: ctx.orgId }, orderBy: { order: 'asc' } }),
    db.archiveReason.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: 'asc' } }),
    db.emailTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: 'asc' } }),
    admin ? db.apiKey.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    admin ? db.webhookEndpoint.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
      include: { deliveries: { select: { success: true } } },
    }) : Promise.resolve([]),
    db.customFieldDef.findMany({ where: { orgId: ctx.orgId }, orderBy: { label: 'asc' } }),
    db.scorecardQuestion.findMany({
      where: { orgId: ctx.orgId, archivedAt: null },
      orderBy: { order: 'asc' },
    }),
  ]);
  const isAgency = org?.kind === 'AGENCY';

  return (
    <div>
      <PageHeader title={settings.title} subtitle={settings.subtitle} />

      <div className="mx-6 mt-4 flex gap-8 pb-8">
        <aside className="hidden w-52 shrink-0 md:block">
          {[
            {
              eyebrow: settings.personal,
              items: [
                ['integrations', settings.sections.integrations],
                ...(admin ? [['email', settings.sections.email]] : []),
              ],
            },
            {
              eyebrow: settings.organization,
              items: [
                ['business', settings.sections.business],
                ...(admin ? [
                  ['hiring', settings.sections.hiring],
                  ['team', settings.sections.team],
                ] : []),
                ...(canImportContacts ? [['data', settings.sections.data]] : []),
              ],
            },
          ].map((g) => (
            <div key={g.eyebrow} className="mb-6">
              <p className="mb-1.5 px-3 text-xs font-medium text-ink-2">{g.eyebrow}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map(([key, label]) => (
                  <a
                    key={key}
                    href={`/settings?section=${key}`}
                    aria-current={section === key ? 'page' : undefined}
                    className={`flex h-8 items-center rounded-full px-3 text-sm transition-colors duration-[120ms] ${
                      section === key ? 'bg-surface font-medium text-ink' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink'
                    }`}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </aside>

      <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-8">
        {section === 'business' ? (
        <Group id="org" title={settings.organization}>
          <Row>
            <div className="flex items-center gap-2">
              <p className="text-md font-medium text-ink">{org?.name}</p>
              <span className={badge}>{organization.kinds[isAgency ? 'AGENCY' : 'COMPANY'].title}</span>
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {settings.business.careers}{' '}
              <a
                href={`/careers/${org?.slug}`}
                target="_blank"
                className="font-mono text-xs text-ink underline underline-offset-2"
              >
                /careers/{org?.slug}
              </a>
            </p>
          </Row>
          {admin ? <Row>
            <p className="mb-3 text-sm text-ink-2">
              {isAgency ? settings.business.agencyLogo : settings.business.companyLogo}
            </p>
            <LogoUpload
              logoFileId={org?.logoFileId ?? null}
              upload={uploadOrgLogoAction}
              remove={removeOrgLogoAction}
              label={settings.business.logo}
            />
          </Row> : null}
        </Group>
        ) : null}

        {section === 'business' && isAdmin(ctx) && org ? (
        <Group title={settings.business.brand}>
          <Row>
            <p className="mb-5 text-sm text-ink-2">
              {settings.business.brandDescription}
            </p>
            <BrandKitEditor initial={readBrand(org.brand)} logoFileId={org.logoFileId} orgName={org.name} />
          </Row>
        </Group>
        ) : null}

        {section === 'business' ? (
        <Group title={isAgency ? organization.client.plural : organization.department.plural}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {isAgency
                ? settings.business.clientsDescription
                : settings.business.departmentsDescription}
            </p>
            {isAgency ? (
              isAdmin(ctx) || ctx.accessRole === 'TEAM_MEMBER' ? (
                <div className="grid justify-items-start gap-4">
                  <Link href="/clients" className={buttonClass({ variant: 'tonal' })}>Gerenciar empresas clientes</Link>
                  {isAdmin(ctx) ? (
                    <details className="w-full">
                      <summary className="cursor-pointer text-sm underline">Cadastro rápido de empresas</summary>
                      <div className="mt-3">
                        <GroupManager kind="client" items={org?.clientCompanies ?? []} placeholder={organization.client.example} />
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null
            ) : admin ? (
              <GroupManager
                kind="department"
                items={(org?.departments ?? []).map((group) => ({ id: group.id, name: group.name }))}
                placeholder={organization.department.example}
              />
            ) : null}
          </Row>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group id="hiring" title={settings.controls.stages}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {settings.controls.stagesDescription}
            </p>
            <StageManager
              showRgaPipeline={isAgency && isRgaWorkspace(ctx.orgId)}
              stages={stages.map((s) => ({ id: s.id, name: s.name, type: s.type, disabled: s.disabled }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'email' ? (
        <Group id="email" title={settings.controls.templates}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {settings.controls.templatesDescription}
            </p>
            <TemplateManager
              templates={templates.map((t) => ({
                id: t.id,
                name: t.name,
                subject: t.subject,
                body: t.body,
              }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'email' ? (
        <Group title={settings.controls.automation}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {settings.controls.automationDescription}
            </p>
            <AutomationSettings
              templates={templates.map((t) => ({ id: t.id, name: t.name }))}
              settings={{
                autoConfirmTemplateId: org?.autoConfirmTemplateId ?? null,
                autoRejectTemplateId: org?.autoRejectTemplateId ?? null,
                autoInterviewTemplateId: org?.autoInterviewTemplateId ?? null,
                autoRejectDelayHours: org?.autoRejectDelayHours ?? 48,
              }}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.fields}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {settings.controls.fieldsDescription}
            </p>
            <CustomFieldsManager
              defs={fieldDefs.map((d) => ({ id: d.id, label: d.label, type: d.type, options: d.options }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.eeo}>
          <ControlRow
            description={settings.controls.eeoDescription}
          >
            {EEOEnabled() ? <EeoToggle enabled={org?.collectEeo ?? false} /> : <span>Desativado nesta implantação</span>}
          </ControlRow>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.independent}>
          <ControlRow
            description={settings.controls.independentDescription}
          >
            <FeedbackVisibilityToggle enabled={org?.hideFeedbackUntilSubmitted ?? false} />
          </ControlRow>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.network}>
          <ControlRow
            description={settings.controls.networkDescription}
          >
            {talentNetworkAllowed() ? <TalentNetworkToggle enabled={org?.talentNetworkEnabled ?? false} /> : <span>Desativado nesta implantação</span>}
          </ControlRow>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.approvals}>
          <Row>
            <p className="text-sm text-ink-2">
              {settings.controls.approvalsDescription}
            </p>
          </Row>
          <Row className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{settings.controls.postings}</p>
            <PostingApprovalToggle enabled={org?.requirePostingApproval ?? false} />
          </Row>
          <Row className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{settings.controls.offers}</p>
            <SettingsSwitch
              enabled={org?.requireOfferApproval ?? false}
              label={settings.controls.offerApproval}
              onCaption={settings.controls.approvalRequired}
              offCaption={settings.controls.anyoneCanSend}
              onToggle={setRequireOfferApprovalAction}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.scheduling}>
          <ControlRow
            description={settings.controls.schedulingDescription}
          >
            <SettingsSwitch
              enabled={org?.autoScheduleOnInterviewStages ?? false}
              label={settings.controls.sendLinks}
              onCaption={settings.controls.autoLinks}
              offCaption={settings.controls.manualLinks}
              onToggle={setAutoScheduleOnInterviewStagesAction}
            />
          </ControlRow>
        </Group>
        ) : null}

        {section === 'hiring' ? (
        <Group title={settings.controls.scorecard}>
          <Row><a className="underline" href="/settings/modelos-avaliacao">Modelos de avaliação por competências</a></Row>
          <Row><a className="underline" href="/settings/ia">Configurar inteligência artificial</a></Row>
          <Row>
            <p className="text-sm text-ink-2">
              {settings.controls.scorecardDescription}
            </p>
          </Row>
          {scorecardQuestions.length ? (
            scorecardQuestions.map((q) => (
              <Row key={q.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {q.label}{' '}
                  <span className="text-xs text-ink-2">
                    · {q.kind === 'RATING' ? settings.controls.rating : settings.controls.freeText}
                  </span>
                </span>
                <form action={archiveScorecardQuestionAction.bind(null, q.id)}>
                  <button
                    type="submit"
                    className={buttonClass({ variant: 'ghost', size: 'xs', className: 'hover:text-critical' })}
                  >
                    {settings.controls.remove}
                  </button>
                </form>
              </Row>
            ))
          ) : (
            <Row>
              <p className="text-sm text-ink-2">
                {settings.controls.noQuestions}
              </p>
            </Row>
          )}
          <Row>
            <form action={addScorecardQuestionAction} className="flex flex-wrap items-center gap-2">
              <input {...noAutofill}
                name="label"
                required
                placeholder={settings.controls.scorecardExample}
                className={cn(inputClass, 'min-w-64 flex-1')}
              />
              <select name="kind" defaultValue="RATING" className={cn(selectClass, 'w-auto')}>
                <option value="RATING">{settings.controls.rating}</option>
                <option value="TEXT">{settings.controls.freeText}</option>
              </select>
              <button type="submit" className={btnPrimary}>
                {settings.controls.addQuestion}
              </button>
            </form>
          </Row>
        </Group>
        ) : null}

        {section === 'integrations' && notetakers ? (
        <Group id="notetakers" title={settings.controls.notetakers}>
          <NotetakerConnections
            connections={notetakers[0]}
            overview={notetakers[1]}
            demo={notetakers[2]}
            suggestedCount={notetakers[3]}
            notice={notetaker ? { result: notetaker, provider: notetakerProviderId ?? null } : null}
          />
        </Group>
        ) : null}

        {section === 'integrations' && admin ? (
        <Group id="developers" title={settings.controls.apiKeys}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              Chaves Bearer da API REST (<code className="font-mono text-xs">/api/v1</code>):
              vagas, candidaturas, contatos, etapas e eventos. As chaves são exibidas uma vez e armazenadas como hash.
            </p>
            <ApiKeysManager
              keys={apiKeys.map((k) => ({
                id: k.id,
                name: k.name,
                prefix: k.prefix,
                createdAt: k.createdAt.toISOString(),
                lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                revoked: !!k.revokedAt,
              }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'integrations' && admin ? (
        <Group title="Webhooks">
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              Envia eventos assinados por POST (X-Source-Signature, HMAC-SHA256) para seus endpoints à medida que ocorrem, incluindo candidaturas, mudanças de etapa e contratações. Cada evento é entregue pelo menos uma vez, com a ordem preservada por endpoint.
            </p>
            <WebhooksManager
              endpoints={webhooks.map((w) => ({
                id: w.id,
                url: w.url,
                eventTypes: w.eventTypes,
                active: w.active,
                delivered: w.deliveries.filter((d) => d.success).length,
                failed: w.deliveries.filter((d) => !d.success).length,
              }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'integrations' && isAdmin(ctx) ? (
        <Group id="resume-parsing" title={settings.controls.resume}>
          <Row>
            <ResumeParsingStatus orgId={ctx.orgId} />
          </Row>
        </Group>
        ) : null}

        {section === 'data' ? (
        <Group id="data" title={settings.controls.importContacts}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              Importe contatos em lote com um CSV que inclua este cabeçalho:{' '}
              <code className="font-mono text-xs">name,email,phone,headline,location,tags</code>{' '}
              Apenas o campo name é obrigatório. Separe as etiquetas com ponto e vírgula. Linhas com e-mails já cadastrados são ignoradas. Para migrar de outro ATS, use a importação completa abaixo.
            </p>
            <CsvImport />
          </Row>
        </Group>
        ) : null}

        {section === 'data' && admin ? (
        <Group title={settings.controls.importAts}>
          <ControlRow description={settings.controls.importDescription}>
            <Link href="/settings/import" className={buttonClass({ variant: 'tonal', size: 'sm' })}>
              {settings.controls.startImport}
            </Link>
            <Link href="/contacts/sincronizar" className={buttonClass({ variant: 'tonal', size: 'sm' })}>
              Sincronizar banco de talentos
            </Link>
          </ControlRow>
        </Group>
        ) : null}

        {section === 'data' && admin ? (
        <Group title={settings.controls.export}>
          <ControlRow
            description={settings.controls.exportDescription}
          >
            <a href="/api/export" className={buttonClass({ variant: 'tonal', size: 'sm' })}>
              {settings.controls.exportOrg}
            </a>
          </ControlRow>
        </Group>
        ) : null}

        {section === 'team' ? (
        <Group id="team" title={settings.sections.team}>
          <Row>
            <TeamManager
              isAdmin={admin}
              isSuperAdmin={ctx.accessRole === 'SUPER_ADMIN'}
              googleSignIn={googleAuthEnabled()}
              members={members.map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                accessRole: m.accessRole,
                deactivated: !!m.deactivatedAt,
                isSelf: m.id === ctx.userId,
              }))}
            />
          </Row>
        </Group>
        ) : null}

        {section === 'data' && admin ? (
        <Group title={settings.controls.retention}>
          <Row>
            <p className="mb-4 text-sm text-ink-2">
              {settings.controls.retentionDescription}
            </p>
            <form action={saveRetentionAction} className="flex items-center gap-2">
              <input {...noAutofill}
                type="number"
                name="retentionMonths"
                min="1"
                defaultValue={org?.retentionMonths ?? ''}
                placeholder={settings.controls.retentionExample}
                className={cn(inputClass, 'w-28 tabular-nums')}
              />
              <span className="text-sm text-ink-2">{settings.controls.months}</span>
              <button type="submit" className={btnTonal}>
                {settings.controls.save}
              </button>
            </form>
          </Row>
        </Group>
        ) : null}

        {section === 'data' && admin ? (
        <Group title={settings.controls.audit}>
          <ControlRow description={settings.controls.auditDescription}>
            <a href="/settings/audit" className={buttonClass({ variant: 'tonal', size: 'sm' })}>
              {settings.controls.openAudit}
            </a>
          </ControlRow>
        </Group>
        ) : null}

        {section === 'data' && admin ? (
        <Group title={settings.controls.archive}>
          <Row className="grid gap-3">
            <form action={seedRgaArchiveReasonsAction}>
              <button className={btnTonal}>Aplicar motivos iniciais da RGA</button>
            </form>
            {[...archiveReasons, null].map((reason) => (
              <form key={reason?.id ?? 'new'} action={saveArchiveReasonAction.bind(null, reason?.id ?? null)} className="flex flex-wrap items-center gap-2">
                <input name="name" aria-label="Nome do motivo" placeholder="Novo motivo" maxLength={120} required defaultValue={reason?.name} className={inputClass} />
                <select name="category" aria-label="Categoria" defaultValue={outcomeCategory(reason)}>
                  {Object.entries(outcomeNames).map(([key, label]) => <option key={key} value={key} disabled={!!reason && key !== outcomeCategory(reason)}>{label}</option>)}
                </select>
                <button className={btnTonal}>{reason ? 'Salvar' : 'Adicionar motivo'}</button>
              </form>
            ))}
          </Row>
        </Group>
        ) : null}

        {section === 'email' && admin && <form action={translateRgaEmailDefaultsAction}>
          <button className={btnTonal}>Traduzir modelos padrão de e-mail</button>
        </form>}
      </div>
      </div>
    </div>
  );
}
