'use server';

import { adFieldsFromForm } from '@/lib/rga-productivity';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  Commitment,
  InterviewState,
  OfferStatus,
  Origin,
  PostingState,
  RequisitionState,
  WorkplaceType,
} from '@prisma/client';
import { db } from '@/lib/db';
import { BULK_LIMIT, POOL_BULK_LIMIT, type BulkResult } from '@/lib/bulk';
import { requireAuthenticatedSession, requireRecruitingAccess, isAdmin, requireSession } from '@/lib/session';
import { invalidateContactCounts, invalidateLists, invalidatePipelineCounts } from '@/server/lists/cache';
import { createPosting, PostingEditError, setPostingOwner, setPostingState, updatePostingDetails } from '@/server/postings';
import {
  addNote,
  archiveOpportunity,
  CandidateResumeError,
  createCandidate,
  moveStage,
  unarchiveOpportunity,
} from '@/server/opportunities';
import {
  createPlanStep,
  deletePlanStep,
  scheduleInterview,
  setInterviewState,
} from '@/server/interviews';
import { createSchedulingLink, revokeSchedulingLink } from '@/server/scheduling';
import {
  importContactRows,
  CSV_BATCH_ROWS,
  mergeContacts,
  setContactTags,
  updateContactDetails,
  ContactDetailsError,
  type ContactDetailsPatch,
  type CsvImportResult,
} from '@/server/contacts';
import { createTask, setTaskCompleted, snoozeOpportunity } from '@/server/tasks';
import {
  createOffer,
  createRequisition,
  linkPostingToRequisition,
  sendOfferToCandidate,
  setOfferStatus,
  setRequisitionState,
} from '@/server/offers';
import { EncryptedDocumentError } from '@/server/text/types';
import { capabilityPath } from '@/lib/capability-links';
import { emailPublicOrigin, requestBaseUrl } from '@/lib/base-url';
import { normalizeBookingUrl } from '@/lib/booking';
import { createRecruitingShare, revokeRecruitingShares } from '@/server/share-links';
import { getPendingApproval } from '@/server/approvals';
import { submitReferral } from '@/server/referrals';
import { submitFeedback } from '@/server/feedback';
import { aiConfigured, askCorpus, draftMatchCriteria, ensurePostingCriteria, evaluateOpportunity, type CorpusAnswer } from '@/server/ai';
import { saveMatchCriteria } from '@/server/match-criteria';
import type { MatchCriterion } from '@/lib/match-criteria';
import { logAiFailure } from '@/server/ai-client';
import { addTranscript, deleteTranscript, summarizeTranscript } from '@/server/transcripts';
import { addCaseStudy, CaseStudyError, removeCaseStudy } from '@/server/case-studies';
import { buildOpportunityVars, cancelScheduledEmail, sendEmail } from '@/server/email';

export type FormState = { error?: string } | undefined;

const WORKPLACE_TYPES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
const COMMITMENTS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'] as const;
const ORIGINS = ['APPLIED', 'SOURCED', 'REFERRED', 'AGENCY', 'INTERNAL', 'UNIVERSITY'] as const;

function parseIntOrUndefined(value: FormDataEntryValue | null): number | undefined {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function createPostingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return savePostingForm(null, formData);
}

export async function updatePostingDetailsAction(postingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  return savePostingForm(postingId, formData);
}

async function savePostingForm(postingId: string | null, formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'Informe o título da vaga.' };

  const workplaceType = String(formData.get('workplaceType') ?? 'ONSITE');
  const commitment = String(formData.get('commitment') ?? 'FULL_TIME');
  if (!WORKPLACE_TYPES.includes(workplaceType as never))
    return { error: 'Modalidade inválida.' };
  if (!COMMITMENTS.includes(commitment as never)) return { error: 'Tipo de contratação inválido.' };

  const input = {
    title,
    location: String(formData.get('location') ?? '').trim() || undefined,
    workplaceType: workplaceType as WorkplaceType,
    commitment: commitment as Commitment,
    salaryMin: parseIntOrUndefined(formData.get('salaryMin')),
    salaryMax: parseIntOrUndefined(formData.get('salaryMax')),
    salaryCurrency: String(formData.get('salaryCurrency') ?? '').trim() || undefined,
    description: String(formData.get('description') ?? '').trim() || undefined,
    advertisement: Array.from(formData.keys()).some(key => key.startsWith('ad_')) ? adFieldsFromForm(formData) : undefined,
    requirements: formData.has('requirements') ? String(formData.get('requirements') ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 40).map(x => x.slice(0, 500)) : undefined,
  };
  try {
    if (postingId !== null) {
      const updated = await updatePostingDetails(ctx, postingId, input);
      revalidatePath(`/careers/${updated.org.slug}`);
      revalidatePath(`/careers/${updated.org.slug}/${updated.slug}`);
      revalidatePath(`/postings/${postingId}`);
    } else {
      await createPosting(ctx, {
        ...input,
        departmentId: String(formData.get('departmentId') ?? '') || undefined,
        clientCompanyId: String(formData.get('clientCompanyId') ?? '') || undefined,
      });
    }
  } catch (error) {
    if (error instanceof PostingEditError) return { error: error.message };
    if (error instanceof Error && error.message === 'Client not found') {
      return { error: 'Selecione uma empresa cliente ativa do seu espaço de trabalho.' };
    }
    throw error;
  }

  revalidatePath('/postings');
  redirect(postingId === null ? '/postings' : `/postings/${postingId}`);
}

export async function setPostingStateAction(postingId: string, state: PostingState) {
  const ctx = await requireSession();
  await setPostingState(ctx, postingId, state);
  revalidatePath('/postings');
}

/** Who recruits for a role. Shown on the posting and on every candidate for it. */
export async function setPostingOwnerAction(postingId: string, ownerId: string | null) {
  const ctx = await requireSession();
  await setPostingOwner(ctx, postingId, ownerId);
  revalidatePath(`/postings/${postingId}`);
  // every candidate page for this role shows it
  revalidatePath('/candidates/[id]', 'page');
}

export async function createCandidateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const name = String(formData.get('name') ?? '').trim();
  const stageId = String(formData.get('stageId') ?? '');
  const origin = String(formData.get('origin') ?? 'SOURCED');
  if (!name) return { error: 'Informe o nome.' };
  if (!stageId) return { error: 'Selecione uma etapa.' };
  if (!ORIGINS.includes(origin as never)) return { error: 'Origem inválida.' };

  requireRecruitingAccess(ctx);
  const file = formData.get('resume');
  try {
    await createCandidate(ctx, {
      name,
      email: String(formData.get('email') ?? '').trim() || undefined,
      headline: String(formData.get('headline') ?? '').trim() || undefined,
      location: String(formData.get('location') ?? '').trim() || undefined,
      postingId: String(formData.get('postingId') ?? '') || undefined,
      stageId,
      origin: origin as Origin,
      source: String(formData.get('source') ?? '').trim() || undefined,
      resume: file instanceof File && file.size ? { data: Buffer.from(await file.arrayBuffer()), filename: file.name } : undefined,
    });
  } catch (error) {
    if (error instanceof EncryptedDocumentError) return { error: 'Envie um currículo sem proteção por senha.' };
    if (error instanceof CandidateResumeError) return { error: error.message };
    throw error;
  }

  revalidatePath('/pipeline');
  revalidatePath('/contacts');
  redirect('/pipeline');
}

export async function moveStageAction(opportunityId: string, stageId: string, options?: { hireDate?: string; note?: string }) {
  const ctx = await requireSession();
  await moveStage(ctx, opportunityId, stageId, { requireHireDate: true, hireDate: options?.hireDate, note: options?.note });
  revalidatePath('/pipeline');
  revalidatePath('/postings/[id]', 'page');
  revalidatePath('/review'); // Advance on the review queue
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function archiveOpportunityAction(opportunityId: string, archiveReasonId: string, note?: string) {
  const ctx = await requireSession();
  await archiveOpportunity(ctx, opportunityId, archiveReasonId, { note });
  revalidatePath('/pipeline');
  revalidatePath('/postings/[id]', 'page');
  revalidatePath('/review'); // Archive on the review queue
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function unarchiveOpportunityAction(opportunityId: string, stageId?: string) {
  const ctx = await requireSession();
  await unarchiveOpportunity(ctx, opportunityId, stageId || undefined);
  revalidatePath('/pipeline');
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function scheduleInterviewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const startAtRaw = String(formData.get('startAt') ?? '');
  const durationMins = Number.parseInt(String(formData.get('durationMins') ?? '60'), 10);
  const panelistIds = formData.getAll('panelistIds').map(String);

  if (!title) return { error: 'Informe o título da entrevista.' };
  const startAt = new Date(startAtRaw + ':00-03:00');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startAtRaw) || !Number.isFinite(+startAt)
    || new Date(+startAt - 3 * 3600_000).toISOString().slice(0, 16) !== startAtRaw) {
    return { error: 'Informe uma data e um horário válidos em Brasília.' };
  }
  if (panelistIds.length === 0) return { error: 'Selecione pelo menos um entrevistador.' };

  try {
    await scheduleInterview(ctx, {
      opportunityId,
      title,
      startAt,
      durationMins: Number.isFinite(durationMins) ? durationMins : 60,
      location: String(formData.get('location') ?? '').trim() || undefined,
      panelistIds,
      focusAreas: String(formData.get('focusAreas') ?? '')
        .split('|')
        .map((f) => f.trim())
        .filter(Boolean),
    });
  } catch {
    return { error: 'Não foi possível agendar. Confira a participação e os entrevistadores.' };
  }

  revalidatePath(`/candidates/${opportunityId}`);
  revalidatePath('/interviews');
}

export type SchedulingLinkFormState = { error?: string; url?: string } | undefined;

export async function createSchedulingLinkAction(
  _prev: SchedulingLinkFormState,
  formData: FormData,
): Promise<SchedulingLinkFormState> {
  const ctx = await requireSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const durationMins = Number.parseInt(String(formData.get('durationMins') ?? '30'), 10);
  const panelistIds = formData.getAll('panelistIds').map(String);

  if (!title) return { error: 'Informe o título da entrevista.' };
  if (panelistIds.length === 0) return { error: 'Selecione pelo menos um entrevistador.' };

  try {
    const link = await createSchedulingLink(ctx, {
      opportunityId,
      title,
      durationMins: Number.isFinite(durationMins) ? durationMins : 30,
      location: String(formData.get('location') ?? '').trim() || undefined,
      panelistIds,
      windowDays: Number.parseInt(String(formData.get('windowDays') ?? '14'), 10) || 14,
      dayStartHour: Number.parseInt(String(formData.get('dayStartHour') ?? '9'), 10),
      dayEndHour: Number.parseInt(String(formData.get('dayEndHour') ?? '17'), 10),
      timezone: String(formData.get('timezone') ?? '').trim() || undefined,
      focusAreas: String(formData.get('focusAreas') ?? '')
        .split('|')
        .map((f) => f.trim())
        .filter(Boolean),
    });
    revalidatePath(`/candidates/${opportunityId}`);
    return { url: capabilityPath('schedule', link.token) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível criar o link.' };
  }
}

export async function revokeSchedulingLinkAction(linkId: string, opportunityId: string) {
  const ctx = await requireSession();
  await revokeSchedulingLink(ctx, linkId);
  revalidatePath(`/candidates/${opportunityId}`);
}

export type BookingUrlFormState = { error?: string; saved?: boolean } | undefined;

/**
 * Save (or clear, when empty) the signed-in user's own booking page: the
 * Calendly / Cal.com / Google link they can send instead of a Source
 * self-schedule link. It's per person, so each recruiter keeps theirs.
 */
export async function saveBookingUrlAction(
  _prev: BookingUrlFormState,
  formData: FormData,
): Promise<BookingUrlFormState> {
  const ctx = await requireSession();
  const raw = String(formData.get('bookingUrl') ?? '');
  const bookingUrl = raw.trim() ? normalizeBookingUrl(raw) : null;
  if (raw.trim() && !bookingUrl) return { error: 'Informe o endereço completo e válido da sua página de agendamento.' };
  if (!ctx.userId) return { error: 'Entre com uma conta de usuário para salvar a página de agendamento.' };
  await db.user.update({ where: { id: ctx.userId, orgId: ctx.orgId }, data: { bookingUrl } });
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (opportunityId) revalidatePath(`/candidates/${opportunityId}`);
  return { saved: true };
}

export async function setInterviewStateAction(
  interviewId: string,
  opportunityId: string,
  state: InterviewState,
) {
  const ctx = await requireSession();
  await setInterviewState(ctx, interviewId, state);
  revalidatePath(`/candidates/${opportunityId}`);
  revalidatePath('/interviews');
}

export async function submitFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAuthenticatedSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const overallRating = Number.parseInt(String(formData.get('overallRating') ?? ''), 10);
  const summary = String(formData.get('summary') ?? '').trim();

  if (!Number.isFinite(overallRating) || overallRating < 1 || overallRating > 4)
    return { error: 'Selecione a avaliação geral.' };
  if (!summary) return { error: 'Escreva um resumo da avaliação.' };

  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('answer_') && typeof value === 'string')
      answers[key.slice('answer_'.length)] = value;
  }

  try {
    await submitFeedback(ctx, {
      opportunityId,
      interviewId: String(formData.get('interviewId') ?? '') || undefined,
      overallRating,
      summary,
      answers,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar a avaliação.' };
  }

  revalidatePath(`/candidates/${opportunityId}`);
}

export async function sendEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const scheduledAtRaw = String(formData.get('scheduledAt') ?? '');
  const templateId = String(formData.get('templateId') ?? '') || undefined;

  if (!subject || !body) return { error: 'Preencha o assunto e a mensagem.' };

  let scheduledAt: Date | undefined;
  if (scheduledAtRaw) {
    scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime())) return { error: 'Informe um horário válido para o envio.' };
  }

  // buildOpportunityVars doesn't scope by org — verify ownership first
  const owned = await db.opportunity.findFirst({
    where: { id: opportunityId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!owned) return { error: 'Registro não encontrado.' };
  const { vars, toEmail, contactId } = await buildOpportunityVars(opportunityId);
  if (!toEmail) return { error: 'O contato não tem e-mail cadastrado.' };

  await sendEmail({
    orgId: ctx.orgId,
    actorId: ctx.userId ?? undefined,
    contactId,
    opportunityId,
    templateId,
    toEmail,
    subject,
    body,
    vars,
    scheduledAt,
  });

  revalidatePath(`/candidates/${opportunityId}`);
}

export async function cancelEmailAction(messageId: string, opportunityId: string) {
  const ctx = await requireSession();
  await cancelScheduledEmail(ctx, messageId);
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'Informe o título da tarefa.' };
  const dueAtRaw = String(formData.get('dueAt') ?? '');
  const dueAt = dueAtRaw ? new Date(dueAtRaw) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime())) return { error: 'Informe um prazo válido.' };
  await createTask(ctx, {
    title,
    opportunityId: String(formData.get('opportunityId') ?? '') || undefined,
    assigneeId: String(formData.get('assigneeId') ?? '') || undefined,
    dueAt,
  });
  revalidatePath('/tasks');
  const oppId = String(formData.get('opportunityId') ?? '');
  if (oppId) revalidatePath(`/candidates/${oppId}`);
}

export async function setTaskCompletedAction(taskId: string, completed: boolean) {
  const ctx = await requireSession();
  await setTaskCompleted(ctx, taskId, completed);
  revalidatePath('/tasks');
}

export async function snoozeOpportunityAction(
  opportunityId: string,
  untilRaw: string | null,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  let until: Date | null = null;
  if (untilRaw) {
    until = new Date(untilRaw);
    if (Number.isNaN(until.getTime())) return { error: 'Informe uma data válida.' };
  }
  await snoozeOpportunity(ctx, opportunityId, until);
  revalidatePath('/pipeline');
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function createOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const jobTitle = String(formData.get('jobTitle') ?? '').trim();
  if (!jobTitle) return { error: 'Informe o cargo.' };
  const startDateRaw = String(formData.get('startDate') ?? '');
  await createOffer(ctx, {
    opportunityId,
    jobTitle,
    salaryAmount: parseIntOrUndefined(formData.get('salaryAmount')),
    salaryCurrency: String(formData.get('salaryCurrency') ?? '').trim() || undefined,
    equity: String(formData.get('equity') ?? '').trim() || undefined,
    startDate: startDateRaw ? new Date(startDateRaw) : undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
    letterBody: String(formData.get('letterBody') ?? '').trim() || undefined,
  });
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function sendOfferAction(
  offerId: string,
  opportunityId: string,
): Promise<{ error?: string; url?: string; pendingApproval?: boolean }> {
  const ctx = await requireSession();
  try {
    const result = await sendOfferToCandidate(ctx, offerId, await requestBaseUrl());
    revalidatePath(`/candidates/${opportunityId}`);
    revalidatePath('/dashboard');
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar a proposta.' };
  }
}

export async function resolveApprovalAction(
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) return { error: 'Esta ação exige um perfil administrativo.' };
  try {
    const req = await getPendingApproval(ctx, requestId);
    if (decision === 'APPROVED') {
      if (req.subjectType === 'POSTING') await setPostingState(ctx, req.subjectId, 'PUBLISHED');
      else if (req.subjectType === 'OFFER')
        await sendOfferToCandidate(ctx, req.subjectId, await requestBaseUrl());
    } else if (req.subjectType === 'POSTING') {
      await setPostingState(ctx, req.subjectId, 'DRAFT');
    } else if (req.subjectType === 'OFFER') {
      await setOfferStatus(ctx, req.subjectId, 'DRAFT');
    }
    revalidatePath('/dashboard');
    revalidatePath('/postings');
    revalidatePath(req.href);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível registrar a decisão.' };
  }
}

export async function submitReferralAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  if (!name) return { error: 'Informe o nome.' };
  if (!email) return { error: 'Informe o e-mail.' };
  let opportunityId: string;
  try {
    const result = await submitReferral(ctx, {
      name,
      email,
      headline: String(formData.get('headline') ?? '').trim() || undefined,
      postingId: String(formData.get('postingId') ?? '') || undefined,
      relationship: String(formData.get('relationship') ?? '').trim() || undefined,
      notes: String(formData.get('notes') ?? '').trim() || undefined,
    });
    opportunityId = result.opportunityId;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar a indicação.' };
  }
  revalidatePath('/referrals');
  revalidatePath('/pipeline');
  revalidatePath('/contacts');
  redirect(`/candidates/${opportunityId}`);
}

export async function setOfferStatusAction(
  offerId: string,
  opportunityId: string,
  status: OfferStatus,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await setOfferStatus(ctx, offerId, status);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha na operação' };
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function createRequisitionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const code = String(formData.get('code') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!code || !title) return { error: 'Informe o código e o título.' };
  const openings = Number.parseInt(String(formData.get('openings') ?? '1'), 10);
  try {
    await createRequisition(ctx, {
      code,
      title,
      openings: Number.isFinite(openings) ? openings : 1,
      backfill: formData.get('backfill') === 'on',
      salaryMin: parseIntOrUndefined(formData.get('salaryMin')),
      salaryMax: parseIntOrUndefined(formData.get('salaryMax')),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha na operação' };
  }
  revalidatePath('/postings');
}

export async function setRequisitionStateAction(requisitionId: string, state: RequisitionState) {
  const ctx = await requireSession();
  await setRequisitionState(ctx, requisitionId, state);
  revalidatePath('/postings');
}

export async function linkPostingRequisitionAction(postingId: string, requisitionId: string) {
  const ctx = await requireSession();
  await linkPostingToRequisition(ctx, postingId, requisitionId || null);
  revalidatePath('/postings');
}

export async function createPlanStepAction(
  postingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'Informe o título da etapa.' };
  const durationMins = Number.parseInt(String(formData.get('durationMins') ?? '60'), 10);
  await createPlanStep(ctx, {
    postingId,
    title,
    durationMins: Number.isFinite(durationMins) ? durationMins : 60,
    focusAreas: String(formData.get('focusAreas') ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean),
  });
  revalidatePath(`/postings/${postingId}`);
}

export async function deletePlanStepAction(postingId: string, stepId: string) {
  const ctx = await requireSession();
  await deletePlanStep(ctx, stepId);
  revalidatePath(`/postings/${postingId}`);
}

export async function saveReportAction(
  name: string,
  config: Record<string, string>,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const clean = name.trim();
  if (!clean) return { error: 'Informe o nome.' };
  await db.savedReport.create({ data: { orgId: ctx.orgId, name: clean, config } });
  revalidatePath('/reports');
  revalidatePath('/reports/builder');
  return {};
}

export async function deleteSavedReportAction(reportId: string) {
  const ctx = await requireSession();
  await db.savedReport.deleteMany({ where: { id: reportId, orgId: ctx.orgId } });
  revalidatePath('/reports');
  revalidatePath('/reports/builder');
}

export async function saveCustomFieldsAction(opportunityId: string, formData: FormData) {
  const ctx = await requireSession();
  const [opportunity, defs] = await Promise.all([
    db.opportunity.findFirst({ where: { id: opportunityId, orgId: ctx.orgId } }),
    db.customFieldDef.findMany({ where: { orgId: ctx.orgId } }),
  ]);
  if (!opportunity || !defs.length) return;

  const existing =
    opportunity.customFields && typeof opportunity.customFields === 'object'
      ? (opportunity.customFields as Record<string, unknown>)
      : {};
  const values: Record<string, unknown> = { ...existing };
  for (const def of defs) {
    const raw = String(formData.get(`cf_${def.key}`) ?? '').trim();
    if (!raw) {
      delete values[def.key];
      continue;
    }
    if (def.type === 'NUMBER') {
      const n = Number(raw);
      if (Number.isFinite(n)) values[def.key] = n;
    } else if (def.type === 'SELECT') {
      if (def.options.includes(raw)) values[def.key] = raw;
    } else values[def.key] = raw;
  }
  await db.opportunity.update({
    where: { id: opportunity.id, orgId: ctx.orgId, contact: { isAnonymized: false } },
    data: { customFields: values as object },
  });
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function updateContactDetailsAction(
  opportunityId: string,
  contactId: string,
  patch: ContactDetailsPatch,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await updateContactDetails(ctx, contactId, patch);
  } catch (error) {
    if (error instanceof ContactDetailsError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function addCaseStudyAction(
  opportunityId: string,
  contactId: string,
  url: string,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await addCaseStudy(ctx, contactId, url);
  } catch (error) {
    if (error instanceof CaseStudyError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function removeCaseStudyAction(opportunityId: string, id: string): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await removeCaseStudy(ctx, id);
  } catch (error) {
    if (error instanceof CaseStudyError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function setContactTagsAction(contactId: string, tags: string[]) {
  const ctx = await requireSession();
  await setContactTags(ctx, contactId, tags);
  revalidatePath('/contacts');
}

export async function mergeContactsAction(
  primaryId: string,
  duplicateId: string,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  try {
    await mergeContacts(ctx, primaryId, duplicateId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível unificar os registros.' };
  }
  revalidatePath('/contacts');
  revalidatePath('/pipeline');
  return {};
}

/**
 * One batch of a CSV import. The browser parses the file and sends rows in
 * order, CSV_BATCH_ROWS at a time; see importContactRows.
 */
export async function importContactRowsAction(
  header: string[],
  rows: string[][],
  firstRow: number,
  last: boolean,
): Promise<CsvImportResult> {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  // Validate at the boundary: cells must be strings, whatever the caller sent.
  const cells = (row: unknown) => (Array.isArray(row) ? row.map((c) => (typeof c === 'string' ? c : '')) : []);
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, CSV_BATCH_ROWS).map(cells);
  const result = await importContactRows(ctx, cells(header), safeRows, Number.isInteger(firstRow) ? firstRow : 2);
  // Revalidating re-renders the current page into the response — once is enough.
  if (last) revalidatePath('/contacts');
  return result;
}

// Bulk actions skip ids they can't change (deleted meanwhile, another org's)
// and keep the batch going, then report how many they skipped so the client
// can say so instead of those rows quietly snapping back.
//
// The client sends big selections in chunks and marks the last one `final`:
// only that one expires the list caches and revalidates, so the page is
// re-rendered once per bulk edit, not once per chunk. Anything but an
// explicit false counts as final (an older client, a direct caller).
const isFinal = (final: unknown) => final !== false;

export async function bulkMoveStageAction(
  opportunityIds: string[],
  stageId: string,
  final: boolean = true,
  note?: string,
): Promise<BulkResult> {
  const ctx = await requireSession();
  let skipped = Math.max(0, opportunityIds.length - BULK_LIMIT);
  for (const id of opportunityIds.slice(0, BULK_LIMIT)) {
    await moveStage(ctx, id, stageId, { invalidate: false, requireHireDate: true, note }).catch(() => skipped++);
  }
  if (isFinal(final)) {
    invalidatePipelineCounts(ctx.orgId);
    revalidatePath('/pipeline');
    revalidatePath('/pipeline/operacao');
    revalidatePath('/postings/[id]', 'page');
  }
  return { skipped };
}

export async function bulkArchiveAction(
  opportunityIds: string[],
  reasonId: string,
  final: boolean = true,
): Promise<BulkResult> {
  const ctx = await requireSession();
  let skipped = Math.max(0, opportunityIds.length - BULK_LIMIT);
  for (const id of opportunityIds.slice(0, BULK_LIMIT)) {
    await archiveOpportunity(ctx, id, reasonId, { invalidate: false }).catch(() => skipped++);
  }
  if (isFinal(final)) {
    invalidatePipelineCounts(ctx.orgId);
    revalidatePath('/pipeline');
  }
  return { skipped };
}

/** After a bulk edit failed part-way: the chunks that saved never re-rendered the lists. */
export async function revalidateListsAction() {
  const ctx = await requireSession();
  invalidateLists(ctx.orgId);
  revalidatePath('/pipeline');
  revalidatePath('/contacts');
  revalidatePath('/review');
}

export async function bulkTagAction(contactIds: string[], tag: string, final: boolean = true): Promise<BulkResult> {
  const ctx = await requireSession();
  const clean = tag.trim();
  if (!clean) return { skipped: 0 };
  const unique = [...new Set(contactIds)];
  let skipped = Math.max(0, unique.length - BULK_LIMIT);
  for (const contactId of unique.slice(0, BULK_LIMIT)) {
    const contact = await db.contact.findFirst({
      where: { id: contactId, orgId: ctx.orgId },
      select: { tags: true },
    });
    if (!contact) {
      skipped++;
      continue;
    }
    await setContactTags(ctx, contactId, [...contact.tags, clean], { invalidate: false }).catch(() => skipped++);
  }
  if (isFinal(final)) {
    invalidateContactCounts(ctx.orgId);
    revalidatePath('/pipeline');
    revalidatePath('/contacts');
  }
  return { skipped };
}

export async function createShareLinkAction(
  scope: 'posting' | 'client' | 'candidate',
  id: string,
): Promise<{ url?: string; expiresAt?: string; error?: string }> {
  const ctx = await requireAuthenticatedSession();
  const origin = emailPublicOrigin();
  if (!origin) return { error: 'Origem pública não configurada.' };
  const link = await createRecruitingShare(ctx, scope, id);
  if ('error' in link) return { error: link.error };
  return { url: `${origin}/share#${link.code}`, expiresAt: link.expiresAt.toISOString() };
}

export async function revokeShareLinksAction(scope: 'posting' | 'client' | 'candidate', id: string) {
  return revokeRecruitingShares(await requireSession(), scope, id);
}

export async function addTranscriptAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSession();
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const content = String(formData.get('content') ?? '').trim();
  if (!content) return { error: 'Cole a transcrição.' };
  const transcript = await addTranscript(ctx, {
    opportunityId,
    interviewId: String(formData.get('interviewId') ?? '') || undefined,
    title: String(formData.get('title') ?? '').trim() || 'Transcrição da entrevista',
    content,
  });
  // The questions and facts come with the save; a model failure never loses
  // the transcript, and "Pull out the questions" can try again.
  if (aiConfigured()) {
    await summarizeTranscript(ctx, transcript.id).catch((error) => logAiFailure('transcript insights', error));
  }
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function summarizeTranscriptAction(transcriptId: string, opportunityId: string): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await summarizeTranscript(ctx, transcriptId);
  } catch (error) {
    logAiFailure('transcript insights', error);
    return { error: error instanceof Error ? error.message : 'Não foi possível ler a transcrição.' };
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

export async function deleteTranscriptAction(transcriptId: string, opportunityId: string) {
  const ctx = await requireSession();
  await deleteTranscript(ctx, transcriptId);
  revalidatePath(`/candidates/${opportunityId}`);
}

export async function askCorpusAction(question: string): Promise<CorpusAnswer | { error: string }> {
  const ctx = await requireSession();
  const clean = question.trim();
  if (clean.length < 5) return { error: 'Escreva uma pergunta mais completa.' };
  try {
    return await askCorpus(ctx, clean);
  } catch (error) {
    logAiFailure('ask', error);
    return { error: error instanceof Error ? error.message : 'Não foi possível responder à pergunta.' };
  }
}

export async function runAiEvaluationAction(
  opportunityId: string,
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  try {
    await evaluateOpportunity(ctx, opportunityId);
  } catch (error) {
    logAiFailure('evaluation', error);
    return { error: error instanceof Error ? error.message : 'Não foi possível realizar a avaliação.' };
  }
  revalidatePath(`/candidates/${opportunityId}`);
  return {};
}

/**
 * Batch-evaluate the review queue: every ACTIVE opportunity in a LEAD or
 * APPLICANT stage without an evaluation yet (optionally scoped to one
 * posting). Capped per run so a huge queue can't blow the request budget —
 * click again to continue.
 */
export async function batchEvaluateAction(
  postingId?: string,
): Promise<{ evaluated: number; remaining: number; error?: string }> {
  const ctx = await requireSession();
  try {
    const where = {
      orgId: ctx.orgId,
      status: 'ACTIVE' as const,
      stage: { type: { in: ['LEAD' as const, 'APPLICANT' as const] } },
      ...(postingId ? { postingId } : {}),
      aiEvaluations: { none: {} },
    };
    const [queued, batch] = await Promise.all([
      db.opportunity.count({ where }),
      db.opportunity.findMany({ where, orderBy: { createdAt: 'asc' }, select: { id: true, postingId: true }, take: 25 }),
    ]);
    // Each role's criteria first, one at a time, so a role without any is
    // drafted once rather than by five evaluations at the same moment.
    for (const id of new Set(batch.map((o) => o.postingId).filter((p): p is string => !!p))) {
      await ensurePostingCriteria(ctx, id);
    }
    // Five model calls in flight at once: a batch of 25 finishes in about a
    // fifth of the sequential time, well inside the function's time limit.
    for (let i = 0; i < batch.length; i += 5) {
      await Promise.all(batch.slice(i, i + 5).map((opp) => evaluateOpportunity(ctx, opp.id)));
    }
    revalidatePath('/review');
    return { evaluated: batch.length, remaining: queued - batch.length };
  } catch (error) {
    logAiFailure('batch evaluation', error);
    // Some evaluations may have landed before the failure — show them.
    revalidatePath('/review');
    return {
      evaluated: 0,
      remaining: 0,
      error: error instanceof Error ? error.message : 'Não foi possível concluir a avaliação em lote.',
    };
  }
}

export async function saveMatchCriteriaAction(
  postingId: string,
  criteria: MatchCriterion[],
): Promise<{ criteria?: MatchCriterion[]; error?: string }> {
  const ctx = await requireSession();
  try {
    const saved = await saveMatchCriteria(ctx, postingId, criteria);
    revalidatePath(`/postings/${postingId}`);
    revalidatePath('/candidates/[id]', 'page');
    return { criteria: saved };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível salvar os critérios.' };
  }
}

/** Criteria drafted from the posting, for the editor to show; nothing is saved. */
export async function suggestMatchCriteriaAction(postingId: string): Promise<{ criteria?: MatchCriterion[]; error?: string }> {
  const ctx = await requireSession();
  const posting = await db.posting.findFirst({
    where: { id: postingId, orgId: ctx.orgId },
    select: { title: true, location: true, content: true },
  });
  if (!posting) return { error: 'Vaga indisponível.' };
  try {
    return { criteria: await draftMatchCriteria(posting) };
  } catch (error) {
    logAiFailure('criteria draft', error);
    return { error: error instanceof Error ? error.message : 'Não foi possível sugerir critérios.' };
  }
}

export async function addNoteAction(opportunityId: string, formData: FormData) {
  const ctx = await requireSession();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;
  await addNote(ctx, opportunityId, body);
  revalidatePath(`/candidates/${opportunityId}`);
}

/**
 * Test-send for the sequence editor: renders the step against a real
 * contact and mails it with a "Test: " subject prefix. Capped at 10 per
 * user per day so the tool can't become a spam cannon.
 */
export async function sendTestSequenceEmailAction(
  subject: string,
  body: string,
  contactId: string,
  toEmail: string,
): Promise<{ error?: string; sent?: boolean }> {
  const ctx = await requireSession();
  if (!subject.trim() || !body.trim()) return { error: 'Preencha o assunto e a mensagem.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return { error: 'Informe um e-mail válido.' };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await db.emailMessage.count({
    where: {
      orgId: ctx.orgId,
      senderId: ctx.userId,
      subject: { startsWith: 'Test: ' },
      createdAt: { gte: startOfDay },
    },
  });
  if (sentToday >= 10) return { error: 'Limite de envios de teste atingido (10 por dia).' };

  const [contact, org] = await Promise.all([
    db.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId } }),
    db.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
  ]);
  if (!contact) return { error: 'Selecione um candidato para visualizar o modelo.' };

  await sendEmail({
    orgId: ctx.orgId,
    actorId: ctx.userId ?? undefined,
    contactId: contact.id,
    toEmail,
    subject: `Test: ${subject}`,
    body,
    vars: {
      first_name: contact.name.split(' ')[0] ?? contact.name,
      company_name: org?.name ?? '',
      job_title: 'a role',
    },
  });
  return { sent: true };
}

// ---------- Talent pools / saved segments ----------

export async function createTalentPoolAction(formData: FormData) {
  const ctx = await requireSession();
  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (!name) return;
  const q = String(formData.get('q') ?? '').trim();
  const tag = String(formData.get('tag') ?? '').trim();
  const dynamic = !!(q || tag);
  await db.talentPool.upsert({
    where: { orgId_name: { orgId: ctx.orgId, name } },
    update: dynamic ? { kind: 'DYNAMIC', rules: { q, tag } } : {},
    create: {
      orgId: ctx.orgId,
      name,
      kind: dynamic ? 'DYNAMIC' : 'STATIC',
      rules: dynamic ? { q, tag } : undefined,
    },
  });
  invalidateContactCounts(ctx.orgId);
  revalidatePath('/contacts');
}

export async function deleteTalentPoolAction(poolId: string) {
  const ctx = await requireSession();
  await db.talentPool.deleteMany({ where: { id: poolId, orgId: ctx.orgId } });
  invalidateContactCounts(ctx.orgId);
  revalidatePath('/contacts');
}

// A missing pool (deleted in another tab) throws rather than returning
// quietly: with no revalidate, the client would just see its optimistic
// change fall away with no message.
export async function addContactsToPoolAction(
  poolId: string,
  contactIds: string[],
  final: boolean = true,
): Promise<BulkResult> {
  const ctx = await requireSession();
  const pool = await db.talentPool.findFirst({
    where: { id: poolId, orgId: ctx.orgId, kind: 'STATIC' },
  });
  if (!pool) throw new Error('Lista de talentos indisponível');
  const ids = [...new Set(contactIds)];
  const contacts = await db.contact.findMany({
    where: { id: { in: ids.slice(0, POOL_BULK_LIMIT) }, orgId: ctx.orgId, isAnonymized: false },
    select: { id: true },
  });
  await db.talentPool.update({
    where: { id: pool.id },
    data: { members: { connect: contacts.map((c) => ({ id: c.id })) } },
  });
  if (isFinal(final)) {
    invalidateContactCounts(ctx.orgId);
    revalidatePath('/contacts');
  }
  return { skipped: ids.length - contacts.length };
}

export async function removeContactsFromPoolAction(
  poolId: string,
  contactIds: string[],
  final: boolean = true,
): Promise<BulkResult> {
  const ctx = await requireSession();
  const pool = await db.talentPool.findFirst({
    where: { id: poolId, orgId: ctx.orgId, kind: 'STATIC' },
  });
  if (!pool) throw new Error('Lista de talentos indisponível');
  const ids = [...new Set(contactIds)];
  await db.talentPool.update({
    where: { id: pool.id },
    data: { members: { disconnect: ids.slice(0, POOL_BULK_LIMIT).map((id) => ({ id })) } },
  });
  if (isFinal(final)) {
    invalidateContactCounts(ctx.orgId);
    revalidatePath('/contacts');
  }
  return { skipped: Math.max(0, ids.length - POOL_BULK_LIMIT) };
}
