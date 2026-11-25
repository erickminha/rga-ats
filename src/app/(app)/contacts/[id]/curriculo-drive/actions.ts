'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { confirmDriveResume, originalResumeUrl, previewDriveResume } from '@/server/imports/rga-drive';

export async function driveResumeAction(contactId: string, ticket?: string) {
  const ctx = await requireSession();
  try {
    if (typeof contactId !== 'string' || contactId.length > 180) throw new Error('IDENTITY');
    if (ticket === undefined) return { preview: await previewDriveResume(ctx, contactId) };
    const created = await confirmDriveResume(ctx, contactId, ticket);
    revalidatePath('/contacts/' + contactId);
    return { message: created ? 'Currículo vinculado ao cadastro.' : 'Esta versão do currículo já foi vinculada.' };
  } catch {
    return { error: 'Não foi possível conciliar o documento. Confira a autorização, o ID de origem, o arquivo e a configuração de armazenamento. Gere outra prévia após a correção.' };
  }
}

export async function driveResumeBatchAction(tickets?: { id: string; ticket: string }[], offset = 0) {
  const ctx = await requireSession();
  try {
    const { driveBatch } = await import('@/server/imports/rga-drive');
    return { result: await driveBatch(ctx, tickets, offset) };
  } catch { return { error: 'Não foi possível conferir o lote. Revise a integração e tente novamente.' }; }
}

export async function originalResumeAction(contactId: string) {
  const ctx = await requireSession();
  if (typeof contactId !== 'string' || !contactId || contactId.length > 180) return { url: null };
  try { return { url: await originalResumeUrl(ctx, contactId) }; }
  catch { return { url: null }; }
}
