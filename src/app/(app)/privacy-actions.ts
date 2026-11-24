'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin, requireSession } from '@/lib/session';
import { eraseCandidateData, setRetentionHold } from '@/server/retention';

export async function managePrivacyAction(id: string, action: 'hold' | 'release' | 'erase') {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) return 'Esta ação exige acesso administrativo.';
  if (action === 'erase') {
    const done = await eraseCandidateData(ctx, id);
    if (!done) return 'Cadastro indisponível para anonimização. Confira se há seleção ativa, revisão de retenção ou processamento em curso.';
  } else if (action === 'hold' || action === 'release') {
    await setRetentionHold(ctx, id, action === 'hold');
  } else {
    return 'Ação inválida.';
  }
  revalidatePath('/candidates/[id]', 'page');
  return action === 'erase'
    ? 'Cadastro anonimizado. A rotina de retenção repetirá a remoção de arquivos pendentes.'
    : 'Retenção atualizada.';
}
