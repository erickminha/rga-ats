'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { attachTalentResume, recordTalentPreference, saveTalentProfile, selectTalentResume, TalentProfileError } from '@/server/talent-profile';
import { MAX_RESUME_BYTES } from '@/server/resume';

export async function saveTalentProfileAction(id: string | null, _state: { message?: string; error?: string }, form: FormData): Promise<{ message?: string; error?: string }> {
  const ctx = await requireSession();
  let contact;
  try { contact = await saveTalentProfile(ctx, id, form); }
  catch (error) {
    return { error: error instanceof TalentProfileError ? error.message : 'Não foi possível salvar o cadastro.' };
  }
  revalidatePath('/contacts');
  revalidatePath(`/contacts/${contact.id}`);
  if (!id) redirect(`/contacts/${contact.id}`);
  return { message: 'Cadastro atualizado.' };
}

export async function changeTalentResumeAction(id: string, _state: { message?: string; error?: string }, form: FormData): Promise<{ message?: string; error?: string }> {
  const ctx = await requireSession();
  try {
    const operation = form.get('operation');
    if (operation === 'upload') {
      const file = form.get('resume');
      if (!(file instanceof File) || !file.size || file.size > MAX_RESUME_BYTES) return { error: 'Envie um currículo de até 5 MB.' };
      if (form.get('confirmed') !== 'on') return { error: 'Confirme que o documento pertence ao cadastro aberto.' };
      await attachTalentResume(ctx, id, { data: Buffer.from(await file.arrayBuffer()), filename: file.name });
    } else if (operation === 'select') {
      await selectTalentResume(ctx, id, String(form.get('fileId') ?? ''), String(form.get('opportunityId') || '') || undefined);
    } else return { error: 'Operação inválida.' };
  } catch (error) {
    return { error: error instanceof TalentProfileError ? error.message : 'Não foi possível guardar o currículo. Confira o formato e a proteção do arquivo.' };
  }
  revalidatePath(`/contacts/${id}`);
  revalidatePath('/contacts');
  revalidatePath('/candidates/[id]', 'page');
  return { message: 'Currículo atualizado.' };
}

export async function recordTalentPreferenceAction(id: string, _state: { message?: string; error?: string }, form: FormData): Promise<{ message?: string; error?: string }> {
  const ctx = await requireSession();
  const choice = form.get('preference');
  if ((choice !== 'granted' && choice !== 'withdrawn') || form.get('verified') !== 'on') {
    return { error: 'Confirme a preferência diretamente com o titular antes de registrá-la.' };
  }
  try { await recordTalentPreference(ctx, id, choice === 'granted'); }
  catch { return { error: 'Não foi possível registrar a preferência.' }; }
  revalidatePath(`/contacts/${id}`);
  return { message: 'Preferência registrada.' };
}
