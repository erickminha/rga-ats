'use server';

import { revalidatePath } from 'next/cache';
import { moveStage } from '@/server/opportunities';
import { requireSession } from '@/lib/session';
import { setPostingStageExclusions, setStageAvailability } from '@/server/stages';

export async function setStageAvailabilityAction(id: string, enabled: boolean) {
  try {
    await setStageAvailability(await requireSession(), id, enabled);
    revalidatePath('/settings');
    revalidatePath('/pipeline');
    return {};
  } catch {
    return { error: 'Não foi possível alterar a etapa. Mantenha uma etapa inicial e uma etapa de candidatura ativas.' };
  }
}

export async function setPostingStagesAction(id: string, form: FormData) {
  await setPostingStageExclusions(await requireSession(), id, form.getAll('excluded').map(String));
  revalidatePath('/postings/' + id);
  revalidatePath('/pipeline');
}

export async function correctHireAction(id: string, form: FormData) {
  await moveStage(await requireSession(), id, String(form.get('stage') ?? ''), { correctHire: true, note: String(form.get('note') ?? '') });
  revalidatePath('/candidates/' + id);
  revalidatePath('/pipeline');
  revalidatePath('/postings/[id]', 'page');
}
