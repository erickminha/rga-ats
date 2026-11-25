import { dimensions, scoreDisc, validatedDiscInterpretation, type ScoringKey } from '@/lib/native-disc';
import { OpinionEditor } from '@/components/opinion-editor';
import { opinionTemplates } from '@/lib/professional-opinion';
import { recommendationLabels, requirementLabels } from '@/lib/competency-assessment';
import { readCareerProfile } from '@/lib/talent-profile';
import { aiConfigured as opinionAiConfigured } from '@/server/ai-client';
import { CompetencyInterviewForm } from '@/components/competency-assessment';
import { postingRequirements, readInterview, readPlan } from '@/lib/competency-assessment';
import { RecruitingAssessmentForm } from '@/components/recruiting-assessment-form';
import { textRecord } from '@/lib/i18n/pt-BR/assessment';
import { outcomeCategory, outcomeNames, dateBR } from '@/lib/i18n/pt-BR/recruiting';
import { organization } from '@/lib/i18n/pt-BR/organization';
import Link from 'next/link';
import { CandidateLink } from '@/components/candidate-link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { PrivacyControls } from '@/components/privacy-controls';
import { isAdmin, requireSession } from '@/lib/session';
import { addNoteAction, saveCustomFieldsAction } from '@/app/(app)/actions';
import { CandidateStatusControls } from '@/components/archive-controls';
import { ActivityFeed } from '@/components/activity-feed';
import { InterviewSection } from '@/components/interview-section';
import { InterviewFeed } from '@/components/interview-feed';
import { FeedbackSection } from '@/components/feedback-section';
import { AiEvaluationSection } from '@/components/ai-evaluation-section';
import { aiConfigured } from '@/server/ai';
import { TagEditor } from '@/components/tag-editor';
import { DuplicatesBanner } from '@/components/duplicates-banner';
import { findDuplicates } from '@/server/contacts';
import { ocrPending } from '@/server/ocr/status';
import { textPending } from '@/server/text/status';
import { TaskSection } from '@/components/task-section';
import { TranscriptSection } from '@/components/transcript-section';
import { ShareLinkButton } from '@/components/share-link-button';
import { OfferSection } from '@/components/offer-section';
import { EmailSection } from '@/components/email-section';
import { Field, btnTonal, inputClass, surface, textareaClass, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Avatar, Orb } from '@/components/ui/orb';
import { Badge, SectionHeader, StatusDot } from '@/components/ui/primitives';
import { FormSelect } from '@/components/form-select';
import { RoleOwner } from '@/components/role-owner';
import { ContactCard } from '@/components/contact-card';
import { EducationSection, ExperienceSection, SkillsSection } from '@/components/resume-sections';
import { CopyButton } from '@/components/ui/copy-button';
import { readResumeView } from '@/lib/resume-profile';
import { cleanCriteria, readCriterionResults } from '@/lib/match-criteria';
import { mergeFacts, readInsights } from '@/lib/interview-insights';
import { KeyFactsSection } from '@/components/key-facts';
import { CaseStudiesSection } from '@/components/case-studies-section';
import { HighlightsSection } from '@/components/highlights';
import { mergeHighlights, readHighlights, resumeHighlights } from '@/lib/highlights';
import type { OpportunityStatus } from '@prisma/client';
import { hasUsableNotetaker } from '@/server/notetakers/binding';

const ORIGIN_LABELS: Record<string, string> = {
  APPLIED: "Candidatura",
  SOURCED: "Prospecção",
  REFERRED: "Indicação",
  AGENCY: organization.kinds.AGENCY.title,
  INTERNAL: "Interna",
  UNIVERSITY: "Universidade",
};

/**
 * The order of a candidate's application tiles: open ones first, since
 * those are what someone acts on, then hires, then archived. Newest first
 * within each group.
 */
const STATUS_RANK: Record<OpportunityStatus, number> = { ACTIVE: 0, HIRED: 1, ARCHIVED: 2 };
function orderApplications<T extends { status: OpportunityStatus; createdAt: Date }>(apps: T[]): T[] {
  return [...apps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function CandidateProfile({ id }: { id: string }) {
  const ctx = await requireSession();

  // Two rounds: everything keyed by the opportunity id (from the URL) runs
  // alongside the opportunity itself; only the duplicate check needs the
  // loaded contact. Every query is org-scoped, so a foreign id finds nothing.
  const forContact = { orgId: ctx.orgId, contact: { opportunities: { some: { id } } } };
  const [
    opportunity,
    org,
    stages,
    archiveReasons,
    teammates,
    events,
    templates,
    emailMessages,
    networkConsent,
    aiEvaluations,
    fieldDefs,
    schedulingLinks,
    scorecardQuestions,
    applications,
    me,
    notetakerReady,
  ] = await Promise.all([
    db.opportunity.findFirst({
      where: { id, orgId: ctx.orgId },
      include: {
        contact: { include: { resumeFile: true, caseStudies: { orderBy: { position: 'asc' } } } },
        applicationResume: true,
        recruitingAssessment: { include: { opinionVersions: { orderBy: { version: 'desc' }, select: { version: true, issuedAt: true } } } },
        posting: {
          include: {
            planSteps: { orderBy: { order: 'asc' } },
            clientCompany: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        owner: true,
        stage: true,
        archiveReason: true,
        notes: { orderBy: { createdAt: 'desc' }, include: { author: true } },
        interviews: {
          orderBy: { startAt: 'desc' },
          include: { panelists: { orderBy: { name: 'asc' } } },
        },
        feedback: { orderBy: { createdAt: 'desc' }, include: { author: true, interview: true } },
        tasks: { orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }], include: { assignee: true } },
        offers: { orderBy: { createdAt: 'desc' } },
        transcripts: { orderBy: { createdAt: 'desc' }, include: { interview: true } },
      },
    }),
    db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { hideFeedbackUntilSubmitted: true, requireOfferApproval: true, opinionTemplate: true },
    }),
    db.stage.findMany({ where: { orgId: ctx.orgId }, orderBy: { order: 'asc' } }),
    db.archiveReason.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: 'asc' } }),
    db.user.findMany({
      where: { orgId: ctx.orgId, deactivatedAt: null },
      orderBy: { name: 'asc' },
    }),
    db.event.findMany({
      where: { orgId: ctx.orgId, subjectType: 'opportunity', subjectId: id },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
    db.emailTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: 'asc' } }),
    db.emailMessage.findMany({
      where: { orgId: ctx.orgId, opportunityId: id },
      orderBy: { createdAt: 'desc' },
    }),
    db.consentRecord.findFirst({
      where: { ...forContact, purpose: 'NETWORK_DISCOVERY', withdrawnAt: null },
    }),
    db.aiEvaluation.findMany({
      where: { orgId: ctx.orgId, opportunityId: id },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
    db.customFieldDef.findMany({ where: { orgId: ctx.orgId }, orderBy: { label: 'asc' } }),
    db.schedulingLink.findMany({
      where: { orgId: ctx.orgId, opportunityId: id, usedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { panelists: { select: { name: true }, orderBy: { name: 'asc' } } },
    }),
    db.scorecardQuestion.findMany({
      where: { orgId: ctx.orgId, archivedAt: null },
      orderBy: { order: 'asc' },
    }),
    // Every application this person has here, this one included, for the
    // switcher. Same contact, other roles.
    db.opportunity.findMany({
      where: forContact,
      select: {
        id: true,
        status: true,
        origin: true,
        createdAt: true,
        stage: { select: { name: true } },
        archiveReason: { select: { name: true } },
        posting: { select: { id: true, title: true, clientCompany: { select: { name: true } } } },
      },
    }),
    // the viewer's own booking page, offered in the interview panel
    ctx.userId ? db.user.findUnique({ where: { id: ctx.userId }, select: { bookingUrl: true } }) : null,
    // A notetaker of the viewer's own: their interviews offer "Attach a recording"
    hasUsableNotetaker(ctx),
  ]);
  if (!opportunity) notFound();
  const duplicates = await findDuplicates(ctx.orgId, opportunity.contact);
  const answersOf = (raw: unknown) =>
    raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, { label?: string; kind?: string; value?: string }>)
          .filter((a) => a && typeof a.label === 'string' && typeof a.value === 'string')
          .map((a) => ({
            label: a.label as string,
            kind: a.kind === 'TEXT' ? ('TEXT' as const) : ('RATING' as const),
            value: a.value as string,
          }))
      : undefined;
  const customValues =
    opportunity.customFields && typeof opportunity.customFields === 'object'
      ? (opportunity.customFields as Record<string, unknown>)
      : {};
  const saveCustomFields = saveCustomFieldsAction.bind(null, opportunity.id);

  // Bias control: with independent scorecards on, teammates' feedback stays
  // hidden until the viewer has submitted their own.
  const mustSubmitFirst =
    !!org?.hideFeedbackUntilSubmitted &&
    !opportunity.feedback.some((f) => f.authorId === ctx.userId);
  const visibleFeedback = mustSubmitFirst
    ? opportunity.feedback.filter((f) => f.authorId === ctx.userId)
    : opportunity.feedback;
  const hiddenFeedbackCount = opportunity.feedback.length - visibleFeedback.length;

  const addNote = addNoteAction.bind(null, opportunity.id);
  const { contact } = opportunity;
  const resumeFile = [opportunity.applicationResume, contact.resumeFile].find((file) => file?.orgId === ctx.orgId && !file.deletePendingAt);
  const resumeText = !resumeFile || resumeFile.id === contact.resumeFileId ? contact.resumeText : null;
  const resume = readResumeView(resumeFile?.parsed);
  const assessment = opportunity.recruitingAssessment;
  const disc = textRecord(assessment?.disc);
  const previousDiscs = !contact.isAnonymized && !contact.retentionHold && opportunity.postingId
    ? await db.recruitingAssessment.findMany({
      where: { disc: { path: ['complete'], equals: true }, opportunity: { id: { not: id }, orgId: ctx.orgId,
        contactId: contact.id, confidential: false, posting: { orgId: ctx.orgId } } },
      orderBy: { updatedAt: 'desc' }, take: 12,
      select: { opportunityId: true, opportunity: { select: { posting: { select: { title: true } } } } },
    }) : [];

  const discComplete = !!assessment?.disc && typeof assessment.disc === 'object'
    && !Array.isArray(assessment.disc) && assessment.disc.complete === true;
  // Prefer the latest reviewed native evaluation for a new opinion, without
  // changing the historical DISC field or any previously issued opinion.
  const native = !contact.isAnonymized && !contact.retentionHold && !opportunity.confidential ? await db.nativeDisc.findFirst({
    where: { opportunityId: id, reviewedAt: { not: null }, simulation: ctx.orgId === process.env.RGA_DISC_TEST_ORG_ID, opportunity: { orgId: ctx.orgId } },
    orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }], select: { results: true, answers: true, scoringKey: true, simulation: true },
  }) : null;
  const nativeResult = native?.results as Record<string, unknown> | null;
  const nativeAnalysis = validatedDiscInterpretation(nativeResult?.analysis);
  const nativeScores = native && nativeAnalysis ? scoreDisc(native.answers, native.scoringKey as unknown as ScoringKey) : null;
  const nativeBehavior = nativeScores && nativeAnalysis ? [
    dimensions.map(d => d + ' ' + nativeScores[d]).join(' · '),
    native?.simulation ? 'SIMULAÇÃO — sem validade para seleção real' : 'Tendências autorrelatadas — DISC',
    nativeAnalysis.detail, nativeAnalysis.attention, nativeAnalysis.environment, nativeAnalysis.interview,
  ].join('\n') : '';
  const recordedOpinion = textRecord(assessment?.opinion);
  const preferences = readCareerProfile(contact.careerProfile);
  const review = readInterview(assessment?.competencyInterview);
  const opinionPrefill = {
    education: preferences.education || resume?.education.map(({ degree, field, school }) => [degree, field, school].filter(Boolean).join(' · ')).join('\n') || '',
    history: preferences.experience || resume?.experience.map(({ title, company }) => [title, company].filter(Boolean).join(' · ')).join('\n') || '',
    experience: contact.headline ?? '',
    interview: (review?.completed ? review.answers.map((answer, i) => answer.evidence ? review.questions[i] + '\n' + answer.evidence : '').filter(Boolean).join('\n\n') : '') || visibleFeedback[0]?.summary || '',
    competencies: (review?.answers.flatMap((answer, i) => answer.score === null ? [] : [review.questions[i] + ' — ' + review.scale[answer.score - 1]]).join('\n') || preferences.skills || ''),
    requirements: review?.requirements.filter(({ result }) => result !== 'UNVERIFIED').map(({ label, result }) => label + ' — ' + requirementLabels[result as keyof typeof requirementLabels]).join('\n') || '',
    behavior: nativeBehavior || (discComplete ? [['D', 'I', 'S', 'C'].filter(d => disc[d]).map(d => d.toUpperCase() + ' ' + disc[d]).join(' · '), disc.profile, disc.traits, disc.development].filter(Boolean).join('\n') : ''),
    strengths: nativeAnalysis?.strengths.join('\n') || (discComplete ? disc.strengths ?? '' : ''),
    instruments: [review?.completed ? 'Entrevista por competências' : '', nativeBehavior || discComplete ? 'Inventário comportamental DISC (tendências autorrelatadas)' : ''].filter(Boolean).join('\n'),
    recommendation: review?.recommendation ? [recommendationLabels[review.recommendation as keyof typeof recommendationLabels], review.justification].filter(Boolean).join('\n') : '',
  };
  for (const key of Object.keys(opinionPrefill) as (keyof typeof opinionPrefill)[]) opinionPrefill[key] = opinionPrefill[key].slice(0, 4000);
  const author = assessment?.opinionAuthorId ? await db.user.findFirst({
    where: { orgId: ctx.orgId, id: assessment.opinionAuthorId }, select: { name: true },
  }) : null;
  const background = resume?.summary ?? null;
  // Promotions and long stays from the resume, then the latest evaluation's.
  const highlights = mergeHighlights(
    resume ? resumeHighlights(resume.experience) : [],
    readHighlights(aiEvaluations[0]?.highlights),
  );
  const stageTrack = stages.map((s) => ({ id: s.id, name: s.name }));
  const aiEnabled = aiConfigured();
  const insightsOf = new Map(opportunity.transcripts.map((t) => [t.id, readInsights(t.insights)]));
  const keyFacts = mergeFacts(
    opportunity.transcripts.map((t) => ({
      insights: insightsOf.get(t.id) ?? null,
      title: t.interview?.title ?? t.title,
      createdAt: t.createdAt.toISOString(),
    })),
  );
  const coverNote =
    opportunity.customFields &&
    typeof opportunity.customFields === 'object' &&
    'coverNote' in opportunity.customFields
      ? String((opportunity.customFields as { coverNote?: string }).coverNote ?? '')
      : '';

  return (
    // data-profile: the drawer crossfades from its skeleton to this (globals.css)
    <div data-profile className="mx-auto max-w-6xl px-6 py-6">
      <Link
        href="/pipeline"
        className={`${buttonClass({ variant: 'ghost', size: 'sm' })} -ml-3 mb-4`}
      >
        <ArrowLeft /> Funil de recrutamento
      </Link>

      {/* Header: the focal identity — avatar orb, name, a quiet subtitle */}
      <div className={`${surface} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={contact.name} seed={contact.id} size={56} />
            <div className="min-w-0">
              <h1 className="text-xl font-medium text-ink">{contact.name}</h1>
              {contact.headline || opportunity.posting ? (
                <p className="mt-0.5 text-sm text-ink-2">
                  {contact.headline}
                  {contact.headline && opportunity.posting ? ' · ' : ''}
                  {opportunity.posting ? opportunity.posting.title : null}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ShareLinkButton
              scope="candidate"
              id={opportunity.id}
              canCreate={!opportunity.confidential && !contact.isAnonymized}
              label="Compartilhar perfil"
              subject={{
                name: contact.name,
                detail: opportunity.posting?.title ?? contact.headline,
                seed: contact.id,
              }}
            />
          </div>
        </div>

        {/* Where this application stands and what to do with it, then who
            the person is: origin and tags. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {opportunity.hiredAt && <span>Contratação em {dateBR(opportunity.hiredAt, 'UTC')}</span>}
          <CandidateStatusControls
            opportunityId={opportunity.id}
            status={opportunity.status}
            archiveReason={opportunity.archiveReason ? `${outcomeNames[outcomeCategory(opportunity.archiveReason)]} · ${opportunity.archiveReason.name}` : null}
            stageId={opportunity.stageId}
            stages={stages.map(({ id, name, type }) => ({ id, name, type }))}
            snoozedUntil={opportunity.snoozedUntil?.toISOString() ?? null}
            reasons={archiveReasons.map((r) => ({ id: r.id, name: r.name, category: outcomeCategory(r) }))}
          />
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <Badge>
            {ORIGIN_LABELS[opportunity.origin] ?? opportunity.origin}
            {opportunity.source ? ` · ${opportunity.source}` : ''}
          </Badge>
          {networkConsent ? (
            <span title="Candidato autorizou participação na rede de talentos">
              <Badge tone="positive">Autorização para rede de talentos</Badge>
            </span>
          ) : null}
          <TagEditor contactId={contact.id} tags={contact.tags} />
        </div>

        {coverNote ? (
          <div className="mt-6">
            <p className="mb-1.5 text-xs font-medium text-ink-2">Apresentação da candidatura</p>
            <p className="max-w-prose whitespace-pre-wrap text-sm">{coverNote}</p>
          </div>
        ) : null}
      </div>

      <DuplicatesBanner
        contactId={contact.id}
        duplicates={duplicates.map((d) => ({ id: d.id, name: d.name, email: d.emails[0] ?? null }))}
      />

      {/* Below lg the right column stacks under everything else, so the
          applications move up here to stay in reach. */}
      <div className="mt-8 flex flex-col gap-8 lg:hidden">
        <ApplicationList applications={applications} currentId={opportunity.id} stages={stageTrack} stageId={opportunity.stageId} />
        <RecruiterSection
          postingId={opportunity.posting?.id ?? null}
          roleOwner={opportunity.posting?.owner ?? null}
          candidateOwner={opportunity.owner}
          teammates={teammates.map((t) => ({ id: t.id, name: t.name, email: t.email }))}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-8">
          <AiEvaluationSection
            opportunityId={opportunity.id}
            aiEnabled={aiConfigured()}
            posting={
              opportunity.posting
                ? {
                    id: opportunity.posting.id,
                    title: opportunity.posting.title,
                    criteria: cleanCriteria(opportunity.posting.matchCriteria),
                  }
                : null
            }
            evaluations={aiEvaluations.map((ev) => ({
              id: ev.id,
              recommendation: ev.recommendation,
              summary: ev.summary,
              strengths: ev.strengths,
              concerns: ev.concerns,
              questions: ev.questions,
              criteria: readCriterionResults(ev.criteria),
              matchScore: ev.matchScore,
              createdAt: ev.createdAt.toISOString(),
            }))}
          />
          <InterviewFeed
            opportunityId={opportunity.id}
            aiEnabled={aiEnabled}
            recordings={notetakerReady ? { candidateName: contact.name } : null}
            createdAt={opportunity.createdAt.toISOString()}
            interviews={opportunity.interviews
              .filter((iv) => iv.state === 'COMPLETED')
              .map((iv) => ({
                id: iv.id,
                title: iv.title,
                startAt: iv.startAt.toISOString(),
                panelists: iv.panelists.map((p) => p.name),
                feedback: visibleFeedback
                  .filter((f) => f.interviewId === iv.id)
                  .map((f) => ({
                    id: f.id,
                    rating: f.overallRating,
                    summary: f.summary,
                    author: f.author.name,
                    answers: answersOf(f.answers),
                  })),
                transcripts: opportunity.transcripts
                  .filter((t) => t.interviewId === iv.id)
                  .map((t) => ({
                    id: t.id,
                    title: t.title,
                    source: t.source,
                    preview: t.content.slice(0, 2000),
                    insights: insightsOf.get(t.id) ?? null,
                  })),
              }))}
          />

          <InterviewSection
            opportunityId={opportunity.id}
            bookingUrl={me?.bookingUrl ?? null}
            candidate={{ name: contact.name, email: contact.emails[0] ?? null }}
            recordings={notetakerReady}
            archived={opportunity.status === 'ARCHIVED'}
            planSteps={(opportunity.posting?.planSteps ?? []).map((s) => ({
              id: s.id,
              title: s.title,
              durationMins: s.durationMins,
              focusAreas: s.focusAreas,
            }))}
            teammates={teammates.map((t) => ({ id: t.id, name: t.name }))}
            schedulingLinks={schedulingLinks.map((l) => ({
              id: l.id,
              title: l.title,
              url: `/schedule/${l.token}`,
              panel: l.panelists.map((p) => p.name),
              windowDays: l.windowDays,
            }))}
            interviews={opportunity.interviews
              .filter((iv) => iv.state !== 'COMPLETED')
              .map((iv) => ({
              id: iv.id,
              title: iv.title,
              startAt: iv.startAt.toISOString(),
              durationMins: iv.durationMins,
              location: iv.location,
              state: iv.state,
              panelists: iv.panelists.map((p) => p.name),
            }))}
          />

          <EmailSection
            opportunityId={opportunity.id}
            toEmail={contact.emails[0] ?? null}
            templates={templates.map((t) => ({
              id: t.id,
              name: t.name,
              subject: t.subject,
              body: t.body,
            }))}
            emails={emailMessages.map((m) => ({
              id: m.id,
              subject: m.subject,
              toEmail: m.toEmail,
              status: m.status,
              scheduledAt: m.scheduledAt?.toISOString() ?? null,
              sentAt: m.sentAt?.toISOString() ?? null,
              automated: !m.senderId,
            }))}
          />

          <TranscriptSection
            opportunityId={opportunity.id}
            interviews={opportunity.interviews
              .filter((iv) => iv.state !== 'CANCELED')
              .map((iv) => ({ id: iv.id, title: iv.title }))}
            transcripts={opportunity.transcripts
              .filter((t) => !t.interviewId)
              .map((t) => ({
              id: t.id,
              title: t.title,
              source: t.source,
              interviewTitle: t.interview?.title ?? null,
              chars: t.content.length,
              createdAt: t.createdAt.toISOString(),
              preview: t.content.slice(0, 4000),
              insights: insightsOf.get(t.id) ?? null,
            }))}
            aiEnabled={aiEnabled}
          />

          <FeedbackSection
            opportunityId={opportunity.id}
            interviews={opportunity.interviews
              .filter((iv) => iv.state !== 'CANCELED')
              .map((iv) => ({ id: iv.id, title: iv.title }))}
            hiddenCount={hiddenFeedbackCount}
            questions={scorecardQuestions.map((q) => ({
              id: q.id,
              label: q.label,
              kind: q.kind,
            }))}
            feedback={visibleFeedback
              .filter((f) => !f.interviewId)
              .map((f) => ({
              id: f.id,
              overallRating: f.overallRating,
              summary: f.summary,
              authorName: f.author.name,
              interviewTitle: f.interview?.title ?? null,
              createdAt: f.createdAt.toISOString(),
              answers: answersOf(f.answers),
            }))}
          />

          <section>
            <SectionHeader title="Anotações" />
            <form action={addNote} className={`${surface} flex flex-col gap-3 p-4`}>
              <textarea {...noAutofill}
                name="body"
                rows={3}
                required
                placeholder="Adicionar uma anotação…"
                className={textareaClass}
              />
              <div className="flex justify-end">
                <button type="submit" className={btnTonal}>
                  Adicionar anotação
                </button>
              </div>
            </form>
            {opportunity.notes.length ? (
              <div className={`${surface} mt-3 divide-y divide-line`}>
                {opportunity.notes.map((note) => (
                  <div key={note.id} className="px-5 py-4">
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p className="mt-2 text-xs text-ink-2">
                      {note.author.name} · {note.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-2">Nenhuma anotação registrada.</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <div className="hidden flex-col gap-8 lg:flex">
            <ApplicationList applications={applications} currentId={opportunity.id} stages={stageTrack} stageId={opportunity.stageId} />
            <RecruiterSection
              postingId={opportunity.posting?.id ?? null}
              roleOwner={opportunity.posting?.owner ?? null}
              candidateOwner={opportunity.owner}
              teammates={teammates.map((t) => ({ id: t.id, name: t.name, email: t.email }))}
            />
          </div>

          <ContactCard
            opportunityId={opportunity.id}
            contactId={contact.id}
            details={{
              emails: contact.emails,
              phones: contact.phones,
              location: contact.location,
              links: contact.links,
            }}
            resume={
              resumeFile
                ? {
                    fileId: resumeFile.id,
                    href: `/api/files/${resumeFile.id}`,
                    note:
                      !resumeText && resumeFile.textStatus !== 'OK'
                        ? textPending(resumeFile)
                          ? 'Lendo currículo…'
                          : ocrPending(resumeFile)
                            ? 'Lendo currículo digitalizado…'
                            : resumeFile.textStatus === 'EMPTY'
                              ? 'O currículo pode conter apenas uma imagem. Abra o arquivo para conferir.'
                              : 'Não foi possível ler o texto deste currículo.'
                        : resumeFile.ocrStatus === 'OK'
                          ? 'Texto extraído de imagem. Confira possíveis erros.'
                          : null,
                  }
                : null
            }
          />

          {!contact.isAnonymized && <Link className="text-sm underline" href={`/contacts/${contact.id}#curriculos`}>Gerenciar cadastro e versões de currículo</Link>}
          {!contact.isAnonymized && <CompetencyInterviewForm key={`competency-${opportunity.id}`} id={opportunity.id}
            plan={readPlan(opportunity.posting?.competencyPlan)} review={readInterview(assessment?.competencyInterview)}
            requirements={postingRequirements(opportunity.posting?.matchCriteria, opportunity.posting?.content)} postingId={opportunity.postingId} />}
          {!contact.isAnonymized && opportunity.postingId && <Link className="underline" href={`/disc?vaga=${opportunity.postingId}&participacao=${opportunity.id}`}>Solicitar ou acompanhar DISC</Link>}
          {!contact.isAnonymized && <RecruitingAssessmentForm key={opportunity.id}
            id={opportunity.id} screening={textRecord(assessment?.screening)} disc={disc} discComplete={discComplete}
            discFileId={assessment?.discFileId ?? null} previousDiscs={previousDiscs.map((row) => ({
              id: row.opportunityId, title: row.opportunity.posting?.title ?? 'Vaga anterior',
            }))} />}
          {!contact.isAnonymized && <OpinionEditor id={opportunity.id} content={recordedOpinion} prefill={opinionPrefill}
            templates={opinionTemplates(org?.opinionTemplate).filter((item) => !item.inactive)}
            revision={assessment?.opinionDraftAt?.toISOString() ?? ''}
            issued={assessment?.opinionVersions.map(({ version, issuedAt }) => ({ version, date: issuedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) })) ?? []}
            author={author?.name ?? null} finalized={!!assessment?.opinionFinalizedAt} ai={opinionAiConfigured()} />}
          {isAdmin(ctx) && !contact.isAnonymized ? (
            <PrivacyControls contactId={contact.id} onHold={contact.retentionHold} />
          ) : null}

          <KeyFactsSection facts={keyFacts} />

          {background || resumeText ? (
            <section>
              <SectionHeader
                title="Histórico profissional"
                action={background ? <CopyButton text={background} size="sm" className="-my-1.5" /> : null}
              />
              <div className={`${surface} p-5`}>
                {background ? (
                  <p className="whitespace-pre-wrap text-sm text-ink">{background}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-ink-2">
                    {resumeText!.slice(0, 600)}
                    {resumeText!.length > 600 ? '…' : ''}
                  </p>
                )}
                <p className="mt-4 text-xs text-ink-3">
                  {background ? "Resumo apresentado no currículo" : "Informações do currículo"}
                </p>
              </div>
            </section>
          ) : null}

          <HighlightsSection highlights={highlights} />

          {resume ? (
            <>
              <ExperienceSection experience={resume.experience} />
              <EducationSection education={resume.education} />
              <SkillsSection skills={resume.skills} />
            </>
          ) : null}

          <CaseStudiesSection
            opportunityId={opportunity.id}
            contactId={contact.id}
            studies={contact.caseStudies.map((c) => ({ id: c.id, url: c.url, title: c.title, imageUrl: c.imageUrl }))}
          />

          {fieldDefs.length ? (
            <section>
              <SectionHeader title="Detalhes" />
              <form action={saveCustomFields} className={`${surface} flex flex-col gap-3 p-5`}>
                {fieldDefs.map((def) => (
                  <Field key={def.id} label={def.label}>
                    {def.type === 'SELECT' ? (
                      <FormSelect
                        name={`cf_${def.key}`}
                        defaultValue={String(customValues[def.key] ?? '')}
                        options={[
                          { value: '', label: '—' },
                          ...def.options.map((o) => ({ value: o, label: o })),
                        ]}
                      />
                    ) : (
                      <input {...noAutofill}
                        name={`cf_${def.key}`}
                        type={def.type === 'NUMBER' ? 'number' : def.type === 'DATE' ? 'date' : 'text'}
                        defaultValue={String(customValues[def.key] ?? '')}
                        className={inputClass}
                      />
                    )}
                  </Field>
                ))}
                <div className="flex justify-end">
                  <button type="submit" className={btnTonal}>
                    Salvar detalhes
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <TaskSection
            opportunityId={opportunity.id}
            teammates={teammates.map((t) => ({ id: t.id, name: t.name }))}
            tasks={opportunity.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              dueAt: t.dueAt?.toISOString() ?? null,
              completed: !!t.completedAt,
              assigneeName: t.assignee?.name ?? null,
            }))}
          />

          <OfferSection
            opportunityId={opportunity.id}
            archived={opportunity.status === 'ARCHIVED'}
            canApprove={ctx.accessRole === 'SUPER_ADMIN' || ctx.accessRole === 'ADMIN'}
            approvalRequired={org?.requireOfferApproval ?? false}
            offers={opportunity.offers.map((o) => ({
              id: o.id,
              status: o.status,
              jobTitle: o.jobTitle,
              salaryAmount: o.salaryAmount,
              salaryCurrency: o.salaryCurrency,
              equity: o.equity,
              startDate: o.startDate?.toISOString() ?? null,
              notes: o.notes,
              createdAt: o.createdAt.toISOString(),
              offerUrl: o.token ? `/offer/${o.token}` : null,
              signedName: o.signedName,
              signedAt: o.signedAt?.toISOString() ?? null,
            }))}
          />

          <section>
            <SectionHeader title="Histórico" />
            <ActivityFeed
              events={events.map((e) => ({
                actorName: e.actorId ? teammates.find((person) => person.id === e.actorId)?.name ?? 'Usuário da equipe' : null,
                id: e.id,
                verb: e.verb,
                payload: e.payload as Record<string, unknown> | null,
                occurredAt: e.occurredAt.toISOString(),
              }))}
            />
            {ctx.accessRole === 'SUPER_ADMIN' || ctx.accessRole === 'ADMIN' ? (
              <a
                href={`/api/contacts/${contact.id}/export`}
                className="mt-3 inline-block text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                Exportar dados do titular
              </a>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Every application this person has here. Everything else on the page
 * belongs to the selected one, which links to its posting; the other rows
 * switch to theirs.
 */
function ApplicationList({
  applications,
  currentId,
  stages,
  stageId,
}: {
  applications: {
    id: string;
    status: OpportunityStatus;
    origin: string;
    createdAt: Date;
    stage: { name: string };
    archiveReason: { name: string } | null;
    posting: { id: string; title: string; clientCompany: { name: string } | null } | null;
  }[];
  currentId: string;
  /** The pipeline, in order, for the selected application's progress. */
  stages: { id: string; name: string }[];
  stageId: string;
}) {
  return (
    <section>
      <SectionHeader title={applications.length > 1 ? "Candidaturas" : "Candidatura"} />
      <nav aria-label="Candidaturas" className={`${surface} flex flex-col gap-1 p-1.5`}>
        {orderApplications(applications).map((app) => {
          const added = dateBR(app.createdAt);
          const summary = (
            <span className="flex min-w-0 items-center gap-3">
              <Orb seed={app.posting?.id ?? app.id} size={24} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {app.posting?.title ?? "Sem vaga vinculada"}
                  {app.posting?.clientCompany ? (
                    <span className="font-normal text-ink-2"> @ {app.posting.clientCompany.name}</span>
                  ) : null}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
                  {app.status === 'HIRED' ? <StatusDot tone="positive" /> : null}
                  <span className="truncate">
                    {app.status === 'HIRED'
                      ? "Contratados"
                      : app.status === 'ARCHIVED'
                        ? `Archived${app.archiveReason ? ` · ${app.archiveReason.name}` : ''}`
                        : app.stage.name}
                    <span className="text-ink-3"> · {added}</span>
                  </span>
                </span>
              </span>
            </span>
          );
          const title = `${app.origin === 'APPLIED' ? "Candidatura" : 'Added'} ${added}`;

          if (app.id !== currentId) {
            return (
              <CandidateLink
                key={app.id}
                id={app.id}
                replace
                title={title}
                className="selectable rounded-field px-3 py-2.5 hover:bg-muted"
              >
                {summary}
              </CandidateLink>
            );
          }
          return (
            <div key={app.id} aria-current="page" title={title} className="is-selected rounded-field px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                {summary}
                {app.posting ? (
                  <Link
                    href={`/postings/${app.posting.id}`}
                    className={buttonClass({ variant: 'tonal', size: 'xs' })}
                  >
                    Abrir vaga
                  </Link>
                ) : null}
              </div>
              <StageProgress stages={stages} stageId={stageId} status={app.status} />
            </div>
          );
        })}
      </nav>
    </section>
  );
}

/**
 * How far through the pipeline this application is: one segment per stage,
 * filled up to the current one. Hired fills it; archived keeps where it got
 * to, dimmed.
 */
function StageProgress({
  stages,
  stageId,
  status,
}: {
  stages: { id: string; name: string }[];
  stageId: string;
  status: OpportunityStatus;
}) {
  const at = status === 'HIRED' ? stages.length - 1 : stages.findIndex((s) => s.id === stageId);
  if (stages.length < 2 || at < 0) return null;
  const fill = status === 'HIRED' ? 'bg-positive' : status === 'ARCHIVED' ? 'bg-ink-3' : 'bg-ink';
  return (
    <div
      role="img"
      aria-label={`Stage ${at + 1} of ${stages.length}: ${stages[at].name}`}
      className="mt-2.5 ml-9 flex gap-1"
    >
      {stages.map((s, i) => (
        <span
          key={s.id}
          title={s.name}
          className={`h-1 flex-1 rounded-full ${i <= at ? fill : 'bg-recessed'}`}
        />
      ))}
    </div>
  );
}

type Person = { id: string; name: string; email: string };

/**
 * The recruiter who owns this role (the posting's owner), changeable here
 * for everyone on it. When this candidate is assigned to someone else, a
 * line says so; an application without a posting shows its own owner.
 */
function RecruiterSection({
  postingId,
  roleOwner,
  candidateOwner,
  teammates,
}: {
  postingId: string | null;
  roleOwner: Person | null;
  candidateOwner: Person | null;
  teammates: Person[];
}) {
  if (!postingId) {
    return (
      <section>
        <SectionHeader title="Responsável" />
        <div className={`${surface} p-1.5`}>
          <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
            {candidateOwner ? (
              <>
                <Avatar name={candidateOwner.name} size={24} />
                <p className="truncate text-sm font-medium text-ink">{candidateOwner.name}</p>
              </>
            ) : (
              <p className="text-sm text-ink-2">Sem responsável</p>
            )}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader title="Recrutamento" />
      <div className={`${surface} p-1.5`}>
        <RoleOwner postingId={postingId} owner={roleOwner} teammates={teammates} />
      </div>
      {candidateOwner && candidateOwner.id !== roleOwner?.id ? (
        <p className="mt-2 px-1 text-xs text-ink-2">Responsável pela participação {candidateOwner.name}.</p>
      ) : null}
    </section>
  );
}
