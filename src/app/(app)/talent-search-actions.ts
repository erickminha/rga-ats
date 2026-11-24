'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { db } from '@/lib/db';
import { addContactsToPoolAction, removeContactsFromPoolAction } from "@/app/(app)/actions";
import { Prisma } from '@prisma/client';
import { invalidateContactCounts } from '@/server/lists/cache';
import { pickTalentFilters } from '@/lib/talent-search';
import { reuseTalents } from '@/server/talent-reuse';
import { TalentProfileError } from '@/server/talent-profile';

type Result = { message?: string; error?: string };

export async function reuseTalentsAction(postingId: string, _state: Result, form: FormData): Promise<Result> {
  const ctx = await requireSession();
  if (form.get('confirm') !== 'on') return { error: 'Confirme a inclusão na vaga.' };
  try {
    const people = form.getAll('person').map((id) => ({
      id: String(id).slice(0, 100), fileId: String(form.get(`file:${id}`) || '').slice(0, 100) || undefined,
    }));
    const outcome = await reuseTalents(ctx, postingId, String(form.get('stage') ?? '').slice(0, 100), people);
    revalidatePath('/contacts/busca');
    revalidatePath('/pipeline');
    revalidatePath(`/postings/${postingId}`);
    return { message: [
      `${outcome.created} incluído(s)`,
      outcome.alreadyLinked ? `${outcome.alreadyLinked} já vinculado(s) a esta vaga` : '',
      outcome.unavailable ? `${outcome.unavailable} indisponível(is) para novas oportunidades` : '',
      outcome.invalidFile ? `${outcome.invalidFile} com currículo indisponível` : '',
    ].filter(Boolean).join(' · ') };
  } catch (error) {
    return { error: error instanceof TalentProfileError ? error.message : 'Não foi possível incluir os profissionais.' };
  }
}

export async function saveTalentGroupAction(id: string | null, _state: Result, form: FormData): Promise<Result> {
  const ctx = await requireSession();
  const name = String(form.get('name') ?? '').trim();
  if (!name || name.length > 80) return { error: 'Informe um nome de até 80 caracteres.' };
  try {
    const filters = pickTalentFilters(Object.fromEntries(form.entries()));
    if (id) {
      const pool = await db.talentPool.findFirst({ where: { id, orgId: ctx.orgId } });
      if (!pool) return { error: 'Grupo indisponível.' };
      const refresh = pool.kind === 'DYNAMIC' && form.get('applyFilters') === 'on';
      if (refresh && !Object.keys(filters).length) return { error: 'Selecione filtros antes de atualizar o segmento.' };
      await db.talentPool.update({
        where: { id, orgId: ctx.orgId }, data: { name, ...(refresh ? { rules: { ...filters, advanced: true } } : {}) },
      });
    } else {
      const dynamic = form.get('kind') === 'DYNAMIC';
      if (dynamic && !Object.keys(filters).length) return { error: 'Preencha filtros para salvar um segmento dinâmico.' };
      await db.talentPool.create({
        data: { orgId: ctx.orgId, name, kind: dynamic ? 'DYNAMIC' : 'STATIC',
          rules: dynamic ? { ...filters, advanced: true } : undefined },
      });
    }
    invalidateContactCounts(ctx.orgId);
    revalidatePath('/contacts');
    revalidatePath('/contacts/busca');
    return { message: 'Grupo salvo.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { error: 'Já existe um grupo com esse nome.' };
    return { error: 'Não foi possível salvar o grupo.' };
  }
}

export async function updateTalentMembershipAction(contactId: string, form: FormData) {
  const ctx = await requireSession();
  const poolId = String(form.get('pool') ?? '');
  const person = await db.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId, isAnonymized: false }, select: { id: true } });
  if (!person) throw new TalentProfileError('Cadastro indisponível.');
  if (form.get('operation') === 'remove') await removeContactsFromPoolAction(poolId, [contactId]);
  else await addContactsToPoolAction(poolId, [contactId]);
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath('/contacts/busca');
}
