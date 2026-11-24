import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';
import { invalidateContactCounts, invalidatePipelineCounts } from '@/server/lists/cache';
import { TalentProfileError } from '@/server/talent-profile';

type Selection = { id: string; fileId?: string };
export const talentReuseLimit = 30;

export async function reuseTalents(ctx: SessionContext, postingId: string, stageId: string, people: Selection[]) {
  requireRecruitingAccess(ctx);
  if (!people.length || people.length > talentReuseLimit || new Set(people.map((p) => p.id)).size !== people.length) {
    throw new TalentProfileError('Selecione de 1 a 30 profissionais distintos.');
  }
  const outcome = await db.$transaction(async (tx) => {
    const [posting] = await tx.$queryRaw<{ id: string; title: string }[]>`
      SELECT id, title FROM "Posting" WHERE id = ${postingId} AND "orgId" = ${ctx.orgId} AND state <> 'CLOSED' FOR SHARE
    `;
    if (!posting) throw new TalentProfileError('Vaga indisponível para receber candidatos.');
    const stage = await tx.stage.findFirst({ where: { id: stageId, orgId: ctx.orgId, type: { not: 'HIRED' } } });
    if (!stage) throw new TalentProfileError('Escolha uma etapa inicial anterior à contratação.');
    const result = { created: 0, alreadyLinked: 0, unavailable: 0, invalidFile: 0 };
    for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!await lockIdentifiableContact(tx, ctx.orgId, person.id)) {
        result.unavailable++;
        continue;
      }
      const contact = await tx.contact.findFirst({
        where: { id: person.id, orgId: ctx.orgId, isAnonymized: false, retentionHold: false,
          consents: { some: { orgId: ctx.orgId, purpose: 'PROFILE_STORAGE', withdrawnAt: null } } },
        select: { id: true, resumeFileId: true },
      });
      if (!contact) {
        result.unavailable++;
        continue;
      }
      if (await tx.opportunity.findFirst({ where: { orgId: ctx.orgId, contactId: person.id, postingId }, select: { id: true } })) {
        result.alreadyLinked++;
        continue;
      }
      const fileId = person.fileId || contact.resumeFileId;
      const file = fileId ? await tx.storedFile.findFirst({
        where: { id: fileId, orgId: ctx.orgId, deletePendingAt: null,
          OR: [{ contactId: person.id, resumeVersion: true }, { id: contact.resumeFileId ?? '', OR: [{ contactId: null }, { contactId: person.id }] }] },
        select: { id: true },
      }) : null;
      if (person.fileId && !file) {
        result.invalidFile++;
        continue;
      }
      const opportunity = await tx.opportunity.create({
        data: { orgId: ctx.orgId, contactId: person.id, postingId, stageId, origin: 'SOURCED', source: 'Banco de talentos',
          ownerId: ctx.userId, applicationResumeId: file?.id },
      });
      await tx.stageTransition.create({ data: { opportunityId: opportunity.id, toStageId: stageId, actorId: ctx.userId } });
      await emitEvent(tx, {
        orgId: ctx.orgId, ...actorOf(ctx), verb: 'opportunity.created', subjectType: 'opportunity', subjectId: opportunity.id,
        payload: { stageName: stage.name, postingId, source: 'Banco de talentos' },
      });
      result.created++;
    }
    return result;
  }, { timeout: 15_000 });
  invalidateContactCounts(ctx.orgId);
  invalidatePipelineCounts(ctx.orgId);
  return outcome;
}
