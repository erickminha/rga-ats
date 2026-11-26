import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { discField, discToday, externalDiscLink, externalDiscResult, reusableDisc } from '@/lib/talent-disc';
import { lockIdentifiableContact } from './contact-lock';
import { summaryConsent } from './talent-summary';
import { actorOf, emitEvent } from './events';

export const talentDiscScope = (orgId: string) => ({ orgId, contact: summaryConsent(orgId) });

async function authorized(tx: Prisma.TransactionClient, ctx: SessionContext, contactId: string) {
  requireRecruitingAccess(ctx);
  if (!ctx.userId || !await lockIdentifiableContact(tx, ctx.orgId, contactId) ||
    !await tx.contact.findFirst({ where: { id: contactId, ...summaryConsent(ctx.orgId) }, select: { id: true } }))
    throw new Error('Profissional indisponível ou sem autorização vigente.');
}

async function audit(tx: Prisma.TransactionClient, ctx: SessionContext, contactId: string, id: string, verb: string) {
  await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb, subjectType: 'contact',
    subjectId: contactId, payload: { assessmentId: id, source: 'external' } });
}

export async function createTalentDisc(ctx: SessionContext, contactId: string, form: FormData, completed: boolean) {
  requireRecruitingAccess(ctx);
  const instrument = discField(form, 'instrument', 150, true);
  const authorization = discField(form, 'authorization', 500, true);
  if (form.get('confirmed') !== 'on') throw new Error('Confirme a autorização para esta finalidade.');
  const link = completed ? null : externalDiscLink(discField(form, 'externalUrl', 2000));
  if (completed && form.get('reviewed') !== 'on') throw new Error('Confirme a conferência do resultado original.');
  const payload = completed ? externalDiscResult(form, instrument, discToday()) : null;
  return db.$transaction(async tx => {
    await authorized(tx, ctx, contactId);
    const row = await tx.talentDisc.create({ data: { orgId: ctx.orgId, contactId, createdById: ctx.userId!,
      instrument, authorization, externalUrl: link, ...(payload ? { ...payload, status: 'COMPLETED', completedAt: new Date() } : {}) } });
    await audit(tx, ctx, contactId, row.id, completed ? 'talent_disc.completed' : 'talent_disc.requested');
    return row.id;
  });
}

export async function changeTalentDisc(ctx: SessionContext, contactId: string, id: string, action: 'sent' | 'cancel' | 'complete', form: FormData) {
  requireRecruitingAccess(ctx);
  return db.$transaction(async tx => {
    await authorized(tx, ctx, contactId);
    const row = await tx.talentDisc.findFirst({ where: { id, contactId, ...talentDiscScope(ctx.orgId), status: { in: ['PENDING', 'SENT'] } } });
    if (!row) throw new Error('Solicitação indisponível.');
    if (action === 'sent' && row.status === 'SENT') return;
    if (action === 'complete' && form.get('reviewed') !== 'on') throw new Error('Confirme a conferência do resultado original.');
    if (action === 'sent' && form.get('sentConfirmed') !== 'on') throw new Error('Confirme o envio efetivo.');
    const data = action === 'complete' ? { ...externalDiscResult(form, row.instrument, discToday()), status: 'COMPLETED', completedAt: new Date(), externalUrl: null } :
      action === 'cancel' ? { status: 'CANCELLED', externalUrl: null } : { status: 'SENT', sentAt: new Date() };
    const updated = await tx.talentDisc.updateMany({ where: { id, contactId, orgId: ctx.orgId, status: row.status }, data });
    if (!updated.count) throw new Error('A solicitação mudou; recarregue.');
    await audit(tx, ctx, contactId, id, 'talent_disc.' + (action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : 'sent'));
  });
}

export async function reuseTalentDisc(ctx: SessionContext, contactId: string, id: string, form: FormData) {
  requireRecruitingAccess(ctx);
  const opportunityId = discField(form, 'opportunityId', 100, true);
  const purpose = discField(form, 'purpose', 500, true);
  if (form.get('reuseConfirmed') !== 'on') throw new Error('Confirme finalidade e autorização para a seleção.');
  return db.$transaction(async tx => {
    await authorized(tx, ctx, contactId);
    const row = await tx.talentDisc.findFirst({ where: { id, contactId, ...talentDiscScope(ctx.orgId), status: 'COMPLETED' } });
    const result = row?.result;
    if (!row || !result || typeof result !== 'object' || Array.isArray(result) || result.complete !== true ||
      !reusableDisc(row.validUntil, result.date, discToday(), Number(process.env.RGA_DISC_REUSE_MAX_DAYS ?? 0)))
      throw new Error('Avaliação sem validade vigente comprovada.');
    const opportunity = await tx.opportunity.findFirst({ where: { id: opportunityId, orgId: ctx.orgId, contactId, confidential: false,
      status: 'ACTIVE', posting: { orgId: ctx.orgId } }, select: { id: true } });
    if (!opportunity) throw new Error('Seleção indisponível.');
    const current = await tx.recruitingAssessment.findUnique({ where: { opportunityId } });
    if (current?.discFileId || (current?.disc && Object.keys(current.disc).length)) throw new Error('A seleção já possui DISC. Revise a ficha antes de substituir.');
    const disc = { ...result, sourceTalentDiscId: row.id, reusedAt: new Date().toISOString(), reusedById: ctx.userId, reusePurpose: purpose };
    await tx.recruitingAssessment.upsert({ where: { opportunityId }, create: { opportunityId, disc }, update: { disc } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'talent_disc.reused', subjectType: 'opportunity',
      subjectId: opportunityId, payload: { assessmentId: id } });
    return opportunityId;
  });
}
