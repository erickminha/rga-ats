import { capabilityPath } from '@/lib/capability-links';
import { randomBytes } from 'crypto';
import type { OfferStatus, RequisitionState } from '@prisma/client';
import { db } from '@/lib/db';
import { actorOf, emitEvent } from '@/server/events';
import { closePendingApprovals, requestApproval } from '@/server/approvals';
import { renderTemplate, sendEmail } from '@/server/email';
import { requireRecruitingAccess, isAdmin, type SessionContext } from '@/lib/session';

/**
 * Offers and requisitions (docs/02 §8). The offer is a state machine
 * (DRAFT → SENT → ACCEPTED/DECLINED, or WITHDRAWN); accepting an offer
 * fills a requisition opening when the opportunity's posting is linked to
 * one. Offers carry a merge-token letter document and a tokened public
 * page where the candidate signs by typed name (intent + timestamp kept).
 */

import { DEFAULT_OFFER_LETTER } from '@/lib/i18n/pt-BR/offer';
export { DEFAULT_OFFER_LETTER };

const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  DRAFT: ['SENT', 'PENDING_APPROVAL', 'WITHDRAWN'],
  PENDING_APPROVAL: ['SENT', 'DRAFT', 'WITHDRAWN'],
  SENT: ['ACCEPTED', 'DECLINED', 'WITHDRAWN'],
  ACCEPTED: [],
  DECLINED: [],
  WITHDRAWN: [],
};

export type OfferInput = {
  opportunityId: string;
  jobTitle: string;
  salaryAmount?: number;
  salaryCurrency?: string;
  equity?: string;
  startDate?: Date;
  expiresAt?: Date;
  notes?: string;
  letterBody?: string;
};

type OfferForLetter = {
  jobTitle: string;
  salaryAmount: number | null;
  salaryCurrency: string;
  equity: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  letterBody: string | null;
};

/** Render the offer's letter with its merge tokens filled in. */
export function renderOfferLetter(
  offer: OfferForLetter,
  contactName: string,
  orgName: string,
): string {
  // Preserve formatting for the original English template already issued.
  const legacy = !!offer.letterBody?.startsWith('Dear {{candidate_name}},');
  const locale = legacy ? 'en-US' : 'pt-BR';
  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : legacy ? 'to be agreed' : 'a combinar';
  return renderTemplate(offer.letterBody ?? DEFAULT_OFFER_LETTER, {
    candidate_name: contactName,
    job_title: offer.jobTitle,
    company_name: orgName,
    salary: offer.salaryAmount
      ? `${offer.salaryCurrency} ${offer.salaryAmount.toLocaleString(locale)} ${legacy ? 'per year' : 'por ano'}`
      : legacy ? 'as discussed' : 'conforme combinado',
    equity_clause: offer.equity ? legacy ? `, plus ${offer.equity} equity` : `, mais ${offer.equity} de participação societária` : '',
    start_date: fmtDate(offer.startDate),
    expiry_clause: offer.expiresAt ? ` (${legacy ? 'valid until' : 'válida até'} ${fmtDate(offer.expiresAt)})` : '',
  });
}

export async function createOffer(ctx: SessionContext, input: OfferInput) {
  requireRecruitingAccess(ctx);
  return db.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: input.opportunityId, orgId: ctx.orgId },
      include: { contact: true },
    });
    if (!opportunity) throw new Error('Opportunity not found');
    const offer = await tx.offer.create({
      data: {
        orgId: ctx.orgId,
        opportunityId: opportunity.id,
        jobTitle: input.jobTitle,
        salaryAmount: input.salaryAmount ?? null,
        salaryCurrency: input.salaryCurrency || 'USD',
        equity: input.equity ?? null,
        startDate: input.startDate ?? null,
        expiresAt: input.expiresAt ?? null,
        notes: input.notes ?? null,
        letterBody: input.letterBody?.trim() || DEFAULT_OFFER_LETTER,
        token: randomBytes(24).toString('base64url'),
        createdById: ctx.userId,
      },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'offer.created',
      subjectType: 'opportunity',
      subjectId: opportunity.id,
      payload: { contactName: opportunity.contact.name, jobTitle: input.jobTitle },
    });
    return offer;
  });
}

export async function setOfferStatus(ctx: SessionContext, offerId: string, status: OfferStatus) {
  requireRecruitingAccess(ctx);
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findFirst({
      where: { id: offerId, orgId: ctx.orgId },
      include: { opportunity: { include: { contact: true, posting: true } } },
    });
    if (!offer) throw new Error('Offer not found');
    if (!OFFER_TRANSITIONS[offer.status].includes(status))
      throw new Error(`Cannot move an offer from ${offer.status} to ${status}`);

    const updated = await tx.offer.update({
      where: { id: offer.id },
      data: {
        status,
        sentAt: status === 'SENT' ? new Date() : offer.sentAt,
        respondedAt: status === 'ACCEPTED' || status === 'DECLINED' ? new Date() : offer.respondedAt,
      },
    });

    if (status === 'SENT' || status === 'DRAFT' || status === 'WITHDRAWN') {
      await closePendingApprovals(tx, {
        orgId: ctx.orgId,
        actor: ctx,
        subjectType: 'OFFER',
        subjectId: offer.id,
        state: status === 'SENT' ? 'APPROVED' : status === 'DRAFT' ? 'REJECTED' : 'CANCELED',
      });
    }

    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: `offer.${status.toLowerCase()}`,
      subjectType: 'opportunity',
      subjectId: offer.opportunityId,
      payload: { contactName: offer.opportunity.contact.name, jobTitle: offer.jobTitle },
    });
    return updated;
  });
}

export type RequisitionInput = {
  code: string;
  title: string;
  openings: number;
  backfill?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
};

export async function createRequisition(ctx: SessionContext, input: RequisitionInput) {
  requireRecruitingAccess(ctx);
  const existing = await db.requisition.findUnique({
    where: { orgId_code: { orgId: ctx.orgId, code: input.code } },
  });
  if (existing) throw new Error(`Requisition code "${input.code}" already exists`);
  return db.$transaction(async (tx) => {
    const req = await tx.requisition.create({
      data: {
        orgId: ctx.orgId,
        code: input.code,
        title: input.title,
        openings: Math.max(1, input.openings),
        backfill: input.backfill ?? false,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency || 'USD',
      },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'requisition.created',
      subjectType: 'requisition',
      subjectId: req.id,
      payload: { code: req.code, title: req.title, openings: req.openings },
    });
    return req;
  });
}

export async function setRequisitionState(
  ctx: SessionContext,
  requisitionId: string,
  state: RequisitionState,
) {
  requireRecruitingAccess(ctx);
  return db.$transaction(async (tx) => {
    const req = await tx.requisition.findFirst({ where: { id: requisitionId, orgId: ctx.orgId } });
    if (!req) throw new Error('Requisition not found');
    const updated = await tx.requisition.update({ where: { id: req.id }, data: { state } });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'requisition.state_changed',
      subjectType: 'requisition',
      subjectId: req.id,
      payload: { code: req.code, state },
    });
    return updated;
  });
}

export async function linkPostingToRequisition(
  ctx: SessionContext,
  postingId: string,
  requisitionId: string | null,
) {
  requireRecruitingAccess(ctx);
  const posting = await db.posting.findFirst({ where: { id: postingId, orgId: ctx.orgId } });
  if (!posting) throw new Error('Posting not found');
  if (requisitionId) {
    const req = await db.requisition.findFirst({ where: { id: requisitionId, orgId: ctx.orgId } });
    if (!req) throw new Error('Requisition not found');
  }
  return db.posting.update({ where: { id: posting.id }, data: { requisitionId } });
}

// ---------- offer letter delivery + candidate e-signature ----------

/**
 * Email the candidate their tokened offer-letter link and mark the offer SENT.
 * When the org requires offer approval and the actor is not an admin, this
 * queues a PENDING_APPROVAL request instead of sending.
 */
export async function sendOfferToCandidate(ctx: SessionContext, offerId: string, baseUrl: string) {
  requireRecruitingAccess(ctx);
  const offer = await db.offer.findFirst({
    where: { id: offerId, orgId: ctx.orgId },
    include: {
      opportunity: { include: { contact: true } },
      org: { select: { name: true, requireOfferApproval: true } },
    },
  });
  if (!offer) throw new Error('Offer not found');
  if (offer.status !== 'DRAFT' && offer.status !== 'SENT' && offer.status !== 'PENDING_APPROVAL')
    throw new Error('Only draft, pending, or sent offers can be sent');
  const toEmail = offer.opportunity.contact.emails[0];
  if (!toEmail) throw new Error('Candidate has no email address');
  if (!offer.token) throw new Error('Offer has no link token');

  const admin = isAdmin(ctx);
  if (offer.status === 'PENDING_APPROVAL' && !admin)
    throw new Error('This offer is waiting on approval');

  if (offer.status === 'DRAFT' && offer.org.requireOfferApproval && !admin) {
    await db.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offer.id }, data: { status: 'PENDING_APPROVAL' } });
      await requestApproval(tx, {
        orgId: ctx.orgId,
        actor: ctx,
        subjectType: 'OFFER',
        subjectId: offer.id,
        title: `${offer.opportunity.contact.name} — ${offer.jobTitle}`,
        href: `/candidates/${offer.opportunityId}`,
      });
      await emitEvent(tx, {
        orgId: ctx.orgId,
        ...actorOf(ctx),
        verb: 'offer.approval_requested',
        subjectType: 'opportunity',
        subjectId: offer.opportunityId,
        payload: { contactName: offer.opportunity.contact.name, jobTitle: offer.jobTitle },
      });
    });
    return { url: capabilityPath('offer', offer.token), pendingApproval: true };
  }

  if (offer.status === 'DRAFT' || offer.status === 'PENDING_APPROVAL') {
    await setOfferStatus(ctx, offer.id, 'SENT');
  }

  const body = [
    `Olá, ${offer.opportunity.contact.name.split(' ')[0]}!`,
    '',
    `Segue sua proposta para ${offer.jobTitle} em ${offer.org.name}.`,
    '',
    `Confira e assine a proposta em: ${baseUrl}${capabilityPath('offer', offer.token)}`,
    '',
    `Se tiver dúvidas, responda a este e-mail.`,
  ].join('\n');
  await sendEmail({
    orgId: ctx.orgId,
    actorId: ctx.userId ?? undefined,
    contactId: offer.opportunity.contactId,
    opportunityId: offer.opportunityId,
    toEmail,
    subject: `Sua proposta de ${offer.org.name}`,
    body: 'Mensagem de proposta com link individual omitido do histórico.',
  }, body);
  return { url: capabilityPath('offer', offer.token) };
}

/** Public fetch for the offer page; stamps first view. */
export async function getOfferByToken(token: string) {
  const offer = await db.offer.findUnique({
    where: { token },
    include: {
      opportunity: { include: { contact: { select: { name: true } } } },
      org: { select: { name: true, logoFileId: true } },
    },
  });
  if (!offer) return null;
  if (!offer.viewedAt && offer.status === 'SENT') {
    await db.offer.update({ where: { id: offer.id }, data: { viewedAt: new Date() } });
  }
  return offer;
}

/**
 * Candidate signs by typed name: records intent (name + timestamp), moves
 * the offer to ACCEPTED, and logs offer.signed with the audit payload.
 */
export async function signOfferByToken(token: string, typedName: string) {
  const name = typedName.trim();
  if (name.length < 2) throw new Error('Type your full legal name to sign');

  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { token },
      include: { opportunity: { include: { contact: true } } },
    });
    if (!offer) throw new Error('Offer not found');
    if (offer.status !== 'SENT') throw new Error('This offer is no longer open for signature');
    if (offer.expiresAt && offer.expiresAt.getTime() < Date.now())
      throw new Error('This offer has expired — contact the recruiting team');

    const updated = await tx.offer.update({
      where: { id: offer.id },
      data: {
        status: 'ACCEPTED',
        signedName: name.slice(0, 200),
        signedAt: new Date(),
        respondedAt: new Date(),
      },
    });
    await emitEvent(tx, {
      orgId: offer.orgId,
      actorType: 'candidate',
      actorId: offer.opportunity.contactId,
      verb: 'offer.signed',
      subjectType: 'opportunity',
      subjectId: offer.opportunityId,
      payload: {
        contactName: offer.opportunity.contact.name,
        jobTitle: offer.jobTitle,
        signedName: name,
      },
    });
    return updated;
  });
}

/** Candidate declines from the public page. */
export async function declineOfferByToken(token: string) {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { token },
      include: { opportunity: { include: { contact: true } } },
    });
    if (!offer) throw new Error('Offer not found');
    if (offer.status !== 'SENT') throw new Error('This offer is no longer open');

    const updated = await tx.offer.update({
      where: { id: offer.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await emitEvent(tx, {
      orgId: offer.orgId,
      actorType: 'candidate',
      actorId: offer.opportunity.contactId,
      verb: 'offer.declined',
      subjectType: 'opportunity',
      subjectId: offer.opportunityId,
      payload: { contactName: offer.opportunity.contact.name, jobTitle: offer.jobTitle },
    });
    return updated;
  });
}
