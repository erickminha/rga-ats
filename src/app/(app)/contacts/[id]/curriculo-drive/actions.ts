'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { confirmDriveResume, previewDriveResume } from '@/server/imports/rga-drive';

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
