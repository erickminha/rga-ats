'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { parseCommercialContact, parseCompany } from '@/lib/client-company';
import { requireSession } from '@/lib/session';
import { ClientCompanyError, saveClientCompany, saveCommercialContact, setPostingClient } from '@/server/client-companies';

export type ClientFormState = { error?: string; success?: string; resetKey?: string };

function input<T>(form: FormData, parse: (form: FormData) => T): T {
  try {
    return parse(form);
  } catch (error) {
    throw new ClientCompanyError(error instanceof Error ? error.message : 'Confira os campos informados.');
  }
}

function message(error: unknown) {
  if (error instanceof ClientCompanyError) return error.message;
  console.error('[client-companies] operação não concluída', error instanceof Error ? error.name : 'unknown');
  return 'Não foi possível salvar. Tente novamente.';
}

export async function saveClientAction(id: string | null, _: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await requireSession();
  let saved;
  try {
    saved = await saveClientCompany(ctx, id, input(form, parseCompany));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/clients');
  revalidatePath('/settings');
  revalidatePath('/postings');
  revalidatePath('/pipeline');
  revalidatePath('/postings/new');
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { slug: true } });
  if (org) revalidatePath(`/careers/${org.slug}`, 'layout');
  redirect(`/clients/${saved.id}`);
}

export async function saveCommercialContactAction(
  clientId: string, contactId: string | null, _: ClientFormState, form: FormData,
): Promise<ClientFormState> {
  const ctx = await requireSession();
  let saved;
  try {
    saved = await saveCommercialContact(ctx, clientId, contactId, input(form, parseCommercialContact));
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { success: 'Contato comercial salvo.', resetKey: saved.id };
}

export async function setPostingClientAction(postingId: string, _: ClientFormState, form: FormData): Promise<ClientFormState> {
  const ctx = await requireSession();
  try {
    const value = form.get('clientCompanyId');
    if (typeof value !== 'string') throw new ClientCompanyError('Selecione uma empresa ou a opção sem cliente.');
    await setPostingClient(ctx, postingId, value || null);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/postings/${postingId}`);
  revalidatePath('/postings');
  revalidatePath('/pipeline');
  revalidatePath('/clients');
  revalidatePath('/clients/[id]', 'page');
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { slug: true } });
  if (org) revalidatePath(`/careers/${org.slug}`, 'layout');
  return { success: 'Vínculo da vaga atualizado.' };
}
