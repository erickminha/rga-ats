'use server';
import { db } from '@/lib/db';
import { requireSession, requireRecruitingAccess } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { messageKinds } from '@/lib/rga-productivity';
import { revalidatePath } from 'next/cache';

export async function confirmWhatsappAction(id: string, kind: string) {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  if (!Object.hasOwn(messageKinds, kind)) return { message: 'Modelo inválido.' };
  try {
    await db.$transaction(async tx => {
      const row = await tx.opportunity.findFirst({ where: { id, orgId: ctx.orgId, confidential: false,
        contact: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false } }, select: { id: true, status: true } });
      if (!row || (kind === 'closed' && row.status !== 'ARCHIVED') || (kind === 'approved' && row.status !== 'HIRED')) throw new Error('Indisponível.');
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'whatsapp.manual_confirmed', subjectType: 'opportunity', subjectId: id,
        payload: { template: kind, confirmation: 'manual' } });
    });
    revalidatePath('/candidates/' + id);
    return { message: 'Envio informado pela recrutadora registrado no histórico.' };
  } catch { return { message: 'Não foi possível registrar. Confira a situação da participação.' }; }
}
