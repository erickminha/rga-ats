import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin, type SessionContext } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { retryPendingFileDeletion } from '@/server/storage';
import { invalidateContactCounts, invalidatePipelineCounts } from '@/server/lists/cache';

const importing: Prisma.OrganizationWhereInput = {
  importJobs: { some: { status: { in: ['DISCOVERING', 'REVIEW', 'RUNNING'] } } },
};
const archived: Prisma.ContactWhereInput = { opportunities: { every: { status: 'ARCHIVED' } } };
const eligible: Prisma.ContactWhereInput = { isAnonymized: false, retentionHold: false, org: { NOT: importing } };

async function anonymizeContact(orgId: string, id: string, rule: Prisma.ContactWhereInput, ctx?: SessionContext) {
  const changed = await db.$transaction(async (tx) => {
    // Opportunity creation/activation takes the same lock in the database trigger.
    await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${id} AND "orgId" = ${orgId} FOR NO KEY UPDATE`;
    const contact = await tx.contact.findFirst({
      where: { id, orgId, AND: [eligible, archived, rule] },
      select: { id: true, resumeFileId: true, emails: true, opportunities: { select: { id: true, applicationResumeId: true } } },
    });
    if (!contact) return false;
    const ids = contact.opportunities.map((opportunity) => opportunity.id);
    const byOpportunity = { orgId, opportunityId: { in: ids } };
    const emails = { orgId, OR: [
      { contactId: id }, { opportunityId: { in: ids } },
      { contactId: null, opportunityId: null, toEmail: { in: contact.emails } },
    ] };
    if (await tx.emailMessage.count({
      where: { ...emails, status: 'SCHEDULED', deliveryClaimedAt: { gt: new Date(Date.now() - 30 * 60_000) } },
    })) return false;
    const attachments = [
      ...(contact.resumeFileId ? [contact.resumeFileId] : []),
      ...contact.opportunities.flatMap(({ applicationResumeId }) => applicationResumeId ? [applicationResumeId] : []),
    ];
    const files = await tx.storedFile.findMany({
      where: {
        orgId, OR: [{ contactId: id }, { id: { in: attachments } }],
        contacts: { none: { id: { not: id } } },
        applicationResumes: { none: { contactId: { not: id } } },
        orgLogoOf: { none: {} }, postingLogoOf: { none: {} },
      }, select: { id: true },
    });
    const fileIds = files.map((file) => file.id);
    const [interviews, transcripts, offers, feedback, notes, meetings, tasks, referrals, links, works] = await Promise.all([
      tx.interview.findMany({ where: byOpportunity, select: { id: true } }),
      tx.transcript.findMany({ where: byOpportunity, select: { id: true } }),
      tx.offer.findMany({ where: byOpportunity, select: { id: true } }),
      tx.feedbackSubmission.findMany({ where: byOpportunity, select: { id: true } }),
      tx.note.findMany({ where: byOpportunity, select: { id: true } }),
      tx.externalMeeting.findMany({
        where: { orgId, OR: [
          { interview: { opportunityId: { in: ids } } },
          { transcript: { opportunityId: { in: ids } } },
          { attendeeEmails: { hasSome: contact.emails } },
        ] }, select: { id: true },
      }),
      tx.task.findMany({ where: byOpportunity, select: { id: true } }),
      tx.referral.findMany({ where: { orgId, contactId: id }, select: { id: true } }),
      tx.schedulingLink.findMany({ where: byOpportunity, select: { id: true } }),
      tx.caseStudy.findMany({ where: { orgId, contactId: id }, select: { id: true } }),
    ]);
    const relatedIds = [id, ...ids, ...fileIds, ...[
      interviews, transcripts, offers, feedback, notes, meetings, tasks, referrals, links, works,
    ].flat().map((r) => r.id)];
    await tx.externalMeeting.updateMany({
      where: { orgId, id: { in: meetings.map((r) => r.id) } },
      data: { title: 'Reunião anonimizada', attendeeNames: [], attendeeEmails: [], transcriptId: null, status: 'DISMISSED' },
    });
    await tx.transcript.deleteMany({ where: byOpportunity });
    await tx.note.deleteMany({ where: byOpportunity });
    await tx.task.deleteMany({ where: byOpportunity });
    await tx.schedulingLink.deleteMany({ where: byOpportunity });
    await tx.caseStudy.deleteMany({ where: { orgId, contactId: id } });
    await tx.newsletterRecipient.deleteMany({ where: { orgId, contactId: id } });
    await tx.emailMessage.deleteMany({ where: emails });
    await tx.consentRecord.deleteMany({ where: { orgId, contactId: id } });
    await tx.referral.updateMany({ where: { orgId, contactId: id }, data: { relationship: null, notes: null } });
    await tx.interview.updateMany({ where: byOpportunity, data: { title: 'Entrevista anonimizada', location: null, focusAreas: [] } });
    await tx.feedbackSubmission.updateMany({ where: byOpportunity, data: { summary: '', answers: Prisma.DbNull } });
    await tx.aiEvaluation.updateMany({
      where: byOpportunity, data: { summary: '', strengths: [], concerns: [], questions: [], criteria: Prisma.DbNull, highlights: Prisma.DbNull },
    });
    await tx.offer.updateMany({
      where: byOpportunity,
      data: { notes: null, token: null, signedName: null, letterBody: null, equity: null, jobTitle: 'Proposta anonimizada' },
    });
    // Keep provider identifiers as tombstones so external imports cannot recreate erased profiles.
    await tx.importRef.updateMany({ where: { orgId, internalId: { in: relatedIds } }, data: { snapshot: Prisma.DbNull, fingerprint: null } });
    await tx.event.updateMany({
      where: { orgId, OR: [{ subjectId: { in: relatedIds } }, { actorType: 'candidate', actorId: id }] },
      data: { payload: Prisma.DbNull },
    });
    await tx.shareLink.updateMany({
      where: { orgId, scope: 'candidate', targetId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() },
    });
    await tx.opportunity.updateMany({
      where: { orgId, id: { in: ids } }, data: { source: null, customFields: Prisma.DbNull, applicationResumeId: null },
    });
    await tx.contact.update({
      where: { id },
      data: {
        name: 'Candidato anonimizado', headline: null, location: null, emails: [], phones: [], links: [], tags: [],
        resumeFileId: null, resumeText: null, isAnonymized: true, emailOptOutAt: null, emailBouncedAt: null,
        pools: { set: [] },
      },
    });
    await tx.storedFile.updateMany({
      where: { orgId, id: { in: fileIds } },
      data: { filename: 'arquivo-em-exclusao', parsed: Prisma.DbNull, textError: null, parseError: null, ocrError: null, deletePendingAt: new Date() },
    });
    await emitEvent(tx, {
      orgId, ...(ctx ? actorOf(ctx) : { actorType: 'system' as const }),
      verb: 'contact.anonymized', subjectType: 'contact', subjectId: id,
    });
    return true;
  });
  if (changed) {
    invalidatePipelineCounts(orgId);
    invalidateContactCounts(orgId);
  }
  return changed;
}

export async function setRetentionHold(ctx: SessionContext, id: string, hold: boolean) {
  if (!isAdmin(ctx)) throw new Error('Apenas administradores podem definir retenção.');
  await db.$transaction(async (tx) => {
    const changed = await tx.contact.updateMany({
      where: { id, orgId: ctx.orgId, isAnonymized: false, retentionHold: !hold },
      data: { retentionHold: hold },
    });
    if (changed.count) await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: hold ? 'contact.retention_held' : 'contact.retention_released',
      subjectType: 'contact', subjectId: id,
    });
  });
}

export async function eraseCandidateData(ctx: SessionContext, id: string) {
  if (!isAdmin(ctx)) throw new Error('Apenas administradores podem anonimizar cadastros.');
  const done = await anonymizeContact(ctx.orgId, id, {}, ctx);
  if (done) await retryPendingFileDeletion(ctx.orgId);
  return done;
}

export async function processRetention(): Promise<number> {
  let anonymized = 0;
  const windowed = await db.organization.findMany({
    where: { retentionMonths: { not: null }, NOT: importing },
    select: { id: true, retentionMonths: true },
  });
  for (const org of windowed) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (org.retentionMonths ?? 0));
    const rule = { opportunities: { some: {}, every: { status: 'ARCHIVED' as const, archivedAt: { lte: cutoff } } } };
    const candidates = await db.contact.findMany({ where: { orgId: org.id, ...eligible, ...rule }, select: { id: true }, take: 100 });
    for (const { id } of candidates) if (await anonymizeContact(org.id, id, rule)) anonymized++;
  }
  const declined: Prisma.ContactWhereInput = {
    consents: { some: { purpose: 'PROFILE_STORAGE' } },
    NOT: { consents: { some: { purpose: 'PROFILE_STORAGE', withdrawnAt: null } } },
    opportunities: { some: {}, every: { status: 'ARCHIVED' } },
  };
  const candidates = await db.contact.findMany({ where: { ...eligible, ...declined }, select: { id: true, orgId: true }, take: 100 });
  for (const { orgId, id } of candidates) if (await anonymizeContact(orgId, id, declined)) anonymized++;
  await retryPendingFileDeletion();
  await db.passwordResetLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return anonymized;
}
