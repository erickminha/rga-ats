'use server';

import { revalidatePath } from 'next/cache';
import { assistOpinionSection, saveCustomerFeedback, saveOpinionTemplate } from "@/server/professional-opinion";
import { saveCompetencyInterview, saveCompetencyTemplate, savePostingCompetencies } from "@/server/competency-assessment";
import { requireSession } from '@/lib/session';
import { saveRecruitingAssessment, type AssessmentPart } from '@/server/recruiting-assessment';
import { createShortlistShare, revokeRecruitingShares } from '@/server/share-links';
import { emailPublicOrigin } from '@/lib/base-url';
import { capabilityPath } from '@/lib/capability-links';

export async function saveAssessmentAction(id: string, part: AssessmentPart, form: FormData) {
  const ctx = await requireSession();
  await saveRecruitingAssessment(ctx, id, part, form);
  revalidatePath(`/candidates/${id}`);
  revalidatePath('/postings/[id]', 'page');
}

export async function presentFinalistsAction(id: string, form: FormData) {
  const ctx = await requireSession();
  if (form.get('confirmed') !== 'on') throw new Error('Confirme a autorização para apresentar os dados selecionados.');
  const origin = emailPublicOrigin();
  if (!origin) throw new Error('Origem pública indisponível.');
  const selected = form.getAll('candidates').map(String);
  const reviewed = new Map(selected.map((id) => [id, String(form.get('review-' + id) ?? '')]));
  const share = await createShortlistShare(ctx, id, selected, form.getAll('opinions').map(String), {
    pdf: form.getAll('pdf').map(String), resumes: form.getAll('resumes').map(String), discs: form.getAll('discs').map(String), reviewed,
  });
  revalidatePath(`/postings/${id}`);
  return new URL(capabilityPath('share', share.code), origin).href;
}

export async function revokeFinalistsAction(id: string) {
  const ctx = await requireSession();
  const revoked = await revokeRecruitingShares(ctx, 'shortlist', id);
  revalidatePath(`/postings/${id}`);
  return revoked;
}

export async function saveCompetencyTemplateAction(form: FormData) {
  await saveCompetencyTemplate(await requireSession(), form);
  revalidatePath('/settings/modelos-avaliacao');
  revalidatePath('/postings/[id]', 'page');
}

export async function savePostingCompetenciesAction(id: string, form: FormData) {
  await savePostingCompetencies(await requireSession(), id, form);
  revalidatePath(`/postings/${id}`);
}

export async function saveCompetencyInterviewAction(id: string, form: FormData) {
  await saveCompetencyInterview(await requireSession(), id, form);
  revalidatePath(`/candidates/${id}`);
  revalidatePath('/postings/[id]', 'page');
}

export async function saveOpinionTemplateAction(form: FormData) {
  await saveOpinionTemplate(await requireSession(), form);
  revalidatePath('/settings/modelos-avaliacao');
  revalidatePath('/candidates/[id]', 'page');
}

export async function saveCustomerFeedbackAction(postingId: string, id: string, form: FormData) {
  await saveCustomerFeedback(await requireSession(), postingId, id, form);
  revalidatePath(`/postings/${postingId}`);
}

export async function assistOpinionAction(id: string, section: string, form: FormData) {
  return assistOpinionSection(await requireSession(), id, section, String(form.get('source') ?? ''), form.get('confirmed') === 'on');
}
