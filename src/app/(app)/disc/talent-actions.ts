'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { createTalentDisc, changeTalentDisc, reuseTalentDisc } from '@/server/talent-disc';

export async function talentDiscAction(form: FormData) {
  const ctx = await requireSession();
  const contact = String(form.get('contactId') ?? '');
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  let message = 'Registro atualizado.';
  try {
    if (action === 'request' || action === 'register') await createTalentDisc(ctx, contact, form, action === 'register');
    else if (action === 'sent' || action === 'cancel' || action === 'complete') await changeTalentDisc(ctx, contact, id, action, form);
    else if (action === 'reuse') {
      const opportunity = await reuseTalentDisc(ctx, contact, id, form);
      revalidatePath('/candidates/' + opportunity);
    } else throw new Error('Ação inválida.');
  } catch {
    message = 'Não foi possível concluir. Confira autorização, campos, datas, escala, validade e se já existe DISC na vaga.';
  }
  revalidatePath('/disc');
  revalidatePath('/contacts/' + contact);
  redirect('/disc?' + new URLSearchParams({ profissional: contact, aviso: message }).toString());
}
