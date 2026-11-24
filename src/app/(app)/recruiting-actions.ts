'use server';

import { revalidatePath } from 'next/cache';
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
  const share = await createShortlistShare(ctx, id, form.getAll('candidates').map(String), form.getAll('opinions').map(String));
  return new URL(capabilityPath('share', share.code), origin).href;
}

export async function revokeFinalistsAction(id: string) {
  const ctx = await requireSession();
  return revokeRecruitingShares(ctx, 'shortlist', id);
}
