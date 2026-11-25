'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { emailPublicOrigin } from '@/lib/base-url';
import { cancelDisc, createDiscInvite, discMessage, editDiscInterpretation, emailDisc, prepareDisc, reviewDisc } from '@/server/native-disc';

export async function issueDiscAction(opportunityId: string, days: number, simulation: boolean) {
  const ctx = await requireSession();
  const origin = emailPublicOrigin();
  if (!origin) return { error: 'O endereço público do ATS precisa ser configurado.' };
  try {
    const { token, name, title } = await createDiscInvite(ctx, opportunityId, days, simulation === true);
    const url = origin + '/avaliacao-disc#' + token;
    const message = discMessage(name, title, url);
    revalidatePath('/disc');
    return { url, message };
  } catch { return { error: 'Não foi possível gerar o convite. Confira a participação, o prazo e a autorização da metodologia.' }; }
}

export async function manageDiscAction(id: string, action: 'cancel' | 'prepare' | 'review') {
  const ctx = await requireSession();
  try {
    if (action === 'cancel') await cancelDisc(ctx, id);
    else if (action === 'prepare') await prepareDisc(ctx, id);
    else if (action === 'review') await reviewDisc(ctx, id);
    else return { error: 'Operação inválida.' };
    revalidatePath('/disc');
    return { ok: true };
  } catch { return { error: 'A operação não pôde ser realizada. Confira a permissão e o histórico DISC na ficha.' }; }
}

export async function emailDiscAction(token: string) {
  const ctx = await requireSession();
  const origin = emailPublicOrigin();
  if (!origin) return { error: 'O endereço público não está configurado.' };
  try {
    await emailDisc(ctx, token, origin);
    revalidatePath('/disc');
    return { message: 'Convite enviado por e-mail.' };
  } catch { return { error: 'Não foi possível enviar o convite. Confira o endereço cadastrado e a integração de e-mail.' }; }
}

export async function editDiscAction(id: string, revision: number, input: unknown) {
  const ctx = await requireSession();
  try {
    await editDiscInterpretation(ctx, id, revision, input);
    revalidatePath('/disc');
    return { message: 'Interpretação salva. Confira antes de concluir a revisão.' };
  } catch { return { error: 'Não foi possível salvar. Atualize a página e confira os campos.' }; }
}
