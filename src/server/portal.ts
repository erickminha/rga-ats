import { capabilityPath } from '@/lib/capability-links';
import { reserveRequest } from '@/server/request-limit';
import { talentNetworkAllowed } from '@/server/privacy-options';
import { emailPublicOrigin } from '@/lib/base-url';
import type { StageType } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/server/events';
import { sendEmail } from '@/server/email';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { publicClientName } from '@/lib/public-careers';
import { createPortalToken, portalEmailProof, verifyPortalToken } from '@/lib/portal-token';

/**
 * Candidate portal: magic-link status tracking + consent management.
 * Candidates see friendly status labels derived from stage *types*, never
 * the org's internal stage names or notes.
 */

export function candidateStatus(
  status: string,
  stageType: StageType,
  countsAsRejection: boolean | null,
): keyof typeof candidate.stages {
  if (status === 'HIRED') return 'Hired';
  if (status === 'ARCHIVED') return countsAsRejection ? 'Not selected' : 'Closed';
  switch (stageType) {
    case 'LEAD':
    case 'APPLICANT':
      return 'Application received';
    case 'SCREEN':
      return 'In review';
    case 'ONSITE':
      return 'Interviewing';
    case 'OFFER':
      return 'Offer stage';
    default:
      return 'In progress';
  }
}

/** Email a magic link. Silent when no contact matches — no email enumeration. */
export async function requestPortalLink(orgSlug: string, email: string, baseUrl: string) {
  const normalized = email.toLowerCase().trim();
  if (normalized.length > 254 || orgSlug.length > 150 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return;
  if (!await reserveRequest('portal-link', [orgSlug, normalized], 5, 60 * 60_000)) return;
  const origin = process.env.NODE_ENV === 'production' || process.env.K_SERVICE ? emailPublicOrigin() : baseUrl;
  if (!origin) return;
  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return;
  const contact = await db.contact.findFirst({
    where: { orgId: org.id, emails: { has: normalized }, isAnonymized: false, opportunities: { some: { orgId: org.id, origin: 'APPLIED', confidential: false } } },
  });
  if (!contact) return;

  const token = createPortalToken(contact.id, org.id, 14, normalized);
  const link = new URL(capabilityPath('portal', token), origin).href;
  const mail = candidate.linkEmail(org.name, contact.name.split(' ')[0], link);
  await sendEmail({
    orgId: org.id,
    contactId: contact.id,
    toEmail: normalized,
    subject: mail.subject,
    body: 'Mensagem de acompanhamento com link individual omitido do histórico.',
  }, mail.body);
}

export async function getPortalData(token: string) {
  const payload = verifyPortalToken(token);
  if (!payload) return null;

  const contact = await db.contact.findFirst({
    where: { id: payload.contactId, orgId: payload.orgId, isAnonymized: false },
    include: {
      org: true,
      opportunities: {
        where: { orgId: payload.orgId, origin: 'APPLIED', confidential: false },
        orderBy: { createdAt: 'desc' },
        include: {
          posting: { select: { orgId: true, title: true, content: true, clientCompany: { select: { id: true, orgId: true, name: true } } } },
          stage: true,
          archiveReason: true,
        },
      },
      consents: { orderBy: { grantedAt: 'desc' } },
    },
  });
  if (!contact || (payload.emailProof && !contact.emails.some((email) => portalEmailProof(email) === payload.emailProof))) return null;

  const networkConsent = contact.consents.find(
    (c) => c.orgId === payload.orgId && c.purpose === 'NETWORK_DISCOVERY' && !c.withdrawnAt,
  );

  return {
    contact,
    org: contact.org,
    applications: contact.opportunities.map((opp) => ({
      id: opp.id,
      postingTitle: opp.posting?.orgId === contact.orgId ? opp.posting.title : 'Candidatura geral',
      company: (opp.posting?.orgId === contact.orgId && publicClientName(opp.posting)) || contact.org.name,
      appliedAt: opp.createdAt,
      status: candidateStatus(opp.status, opp.stage.type, opp.archiveReason?.countsAsRejection ?? null),
    })),
    networkOptIn: !!networkConsent,
    networkEnabled: !!payload.emailProof && talentNetworkAllowed() && contact.org.talentNetworkEnabled,
    verifiedPreferences: !!payload.emailProof,
    profileStorage: contact.consents.some((consent) => consent.orgId === payload.orgId
      && consent.purpose === 'PROFILE_STORAGE' && !consent.withdrawnAt),
  };
}

/** Grant or withdraw NETWORK_DISCOVERY consent — candidate-initiated via portal token. */
export async function setPortalPreference(token: string, granted: boolean, profileStorage = false) {
  const purpose = profileStorage ? 'PROFILE_STORAGE' as const : 'NETWORK_DISCOVERY' as const;
  const payload = verifyPortalToken(token);
  if (!payload?.emailProof) throw new Error('Invalid or expired link');

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${payload.contactId} AND "orgId" = ${payload.orgId} FOR NO KEY UPDATE`;
    const contact = await tx.contact.findFirst({
      where: { id: payload.contactId, orgId: payload.orgId, isAnonymized: false },
      select: { id: true, emails: true, org: { select: { talentNetworkEnabled: true } } },
    });
    if (!contact || !contact.emails.some((email) => portalEmailProof(email) === payload.emailProof)) throw new Error('Not found');

    const active = await tx.consentRecord.findFirst({
      where: {
        contactId: contact.id,
        orgId: payload.orgId,
        purpose,
        withdrawnAt: null,
      },
    });

    if (granted && !active && (profileStorage || (talentNetworkAllowed() && contact.org.talentNetworkEnabled))) {
      await tx.consentRecord.create({
        data: { orgId: payload.orgId, contactId: contact.id, purpose },
      });
      await emitEvent(tx, {
        orgId: payload.orgId,
        actorType: 'candidate',
        verb: 'consent.granted',
        subjectType: 'contact',
        subjectId: contact.id,
        payload: { purpose },
      });
    }
    if (!granted && active) {
      await tx.consentRecord.updateMany({
        where: { orgId: payload.orgId, contactId: contact.id, purpose, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      await emitEvent(tx, {
        orgId: payload.orgId,
        actorType: 'candidate',
        verb: 'consent.withdrawn',
        subjectType: 'contact',
        subjectId: contact.id,
        payload: { purpose },
      });
    }
  });
}

export const setNetworkConsent = (token: string, granted: boolean) => setPortalPreference(token, granted);
