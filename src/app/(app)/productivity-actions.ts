'use server';
import { db } from '@/lib/db';
import { isAdmin, requireSession, requireRecruitingAccess } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { approvedForMessage, invalidWhatsappVariable, messageKinds, type MessageKind } from '@/lib/rga-productivity';
import { revalidatePath } from 'next/cache';

export async function confirmWhatsappAction(id: string, kind: string) {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  if (!Object.hasOwn(messageKinds, kind) || ['referenceIntro', 'referenceReminder', 'referenceThanks', 'disc'].includes(kind)) return { message: 'Modelo inválido.' };
  try {
    await db.$transaction(async tx => {
      const row = await tx.opportunity.findFirst({ where: { id, orgId: ctx.orgId, confidential: false,
        contact: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false } }, select: { id: true, status: true, posting: { select: { orgId: true, clientCompanyId: true } }, recruitingAssessment: { select: { clientFeedback: true } } } });
      if (!row || (kind === 'closed' && row.status !== 'ARCHIVED') || (kind === 'approved' && !approvedForMessage(row.status, row.posting?.orgId === ctx.orgId ? row.posting.clientCompanyId : null, row.recruitingAssessment?.clientFeedback))) throw new Error('Indisponível.');
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'whatsapp.manual_confirmed', subjectType: 'opportunity', subjectId: id,
        payload: { template: kind, confirmation: 'manual' } });
    });
    revalidatePath('/candidates/' + id);
    return { message: 'Envio informado pela recrutadora registrado no histórico.' };
  } catch { return { message: 'Não foi possível registrar. Confira a situação da participação.' }; }
}

export async function saveWhatsappTemplatesAction(form: FormData) {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) return { error: 'Somente administradores podem editar os modelos.' };
  const templates: Partial<Record<MessageKind, string>> = {};
  for (const kind of Object.keys(messageKinds) as MessageKind[]) {
    const value = form.get(kind);
    if (typeof value !== 'string') return { error: 'Atualize a página e envie o formulário completo.' };
    const text = value.trim();
    if (!text) continue;
    if (text.length > 2000 || invalidWhatsappVariable(text, kind)) {
      return { error: 'Confira o tamanho e as variáveis do modelo «' + messageKinds[kind] + '».' };
    }
    templates[kind] = text;
  }
  try {
    await db.$transaction(async tx => {
      await tx.organization.update({ where: { id: ctx.orgId }, data: { whatsappTemplates: templates } });
      await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'whatsapp.templates_updated', subjectType: 'organization', subjectId: ctx.orgId });
    });
  } catch {
    return { error: 'Não foi possível salvar os modelos. Tente novamente.' };
  }
  revalidatePath('/settings');
  revalidatePath('/candidates/[id]', 'page');
  revalidatePath('/disc');
  return { message: 'Modelos de WhatsApp salvos.' };
}
