import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { dayBR } from '@/lib/i18n/pt-BR/recruiting';
import { archiveOpportunity, createCandidate, moveStage, unarchiveOpportunity } from '@/server/opportunities';
import { pipelineFilterFor, pipelinePage } from '@/server/lists/pipeline';
import { candidate, createOrg } from './fixtures';
import { hasDb } from './setup';

describe.skipIf(!hasDb)('encerramentos do processo seletivo RGA', () => {
  it('archives one participation, preserves the decision on reopening, and records an effective hire without closing the vacancy', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const posting = await db.posting.create({ data: { orgId: org.id, slug: 'teste', title: 'Vaga teste', state: 'PUBLISHED' } });
    const initial = { name: 'Cadastro fictício', postingId: posting.id, stageId: stages.at(-1)!.id, origin: 'SOURCED' as const };
    await expect(createCandidate(ctx, initial)).rejects.toThrow('etapa inicial');
    expect(await db.opportunity.count({ where: { postingId: posting.id } })).toBe(0);
    const first = await candidate(org.id, stages, [[0, 0]], { postingId: posting.id });
    const other = await db.opportunity.create({ data: { orgId: org.id, contactId: first.contact.id, stageId: stages[0].id } });
    const reason = await db.archiveReason.create({
      data: { orgId: org.id, category: 'WITHDRAWAL', countsAsRejection: false, name: 'Aceitou outra proposta' },
    });
    await archiveOpportunity(ctx, first.opportunity.id, reason.id, { note: 'Observação fictícia' });
    expect(await db.opportunity.findUnique({ where: { id: other.id } })).toMatchObject({ status: 'ACTIVE' });
    const archived = await pipelinePage(pipelineFilterFor(org.id, { status: 'archived', reason: reason.id }, null), 'time');
    expect(archived.rows.map((row) => row.id)).toEqual([first.opportunity.id]);
    await unarchiveOpportunity(ctx, first.opportunity.id, stages[1].id);
    const history = await db.event.findFirstOrThrow({ where: { subjectId: first.opportunity.id, verb: 'opportunity.archived' } });
    expect(history).toMatchObject({
      actorId: admin.id,
      payload: { category: 'WITHDRAWAL', reason: reason.name, postingId: posting.id, note: 'Observação fictícia', stageId: stages[0].id },
    });
    const hired = stages.at(-1)!;
    await expect(moveStage(ctx, first.opportunity.id, hired.id, { requireHireDate: true })).rejects.toThrow('data efetiva');
    const result = await moveStage(ctx, first.opportunity.id, hired.id, { hireDate: dayBR(), requireHireDate: true });
    expect(result.hiredAt?.toISOString().slice(0, 10)).toBe(dayBR());
    expect(result.status).toBe('HIRED');
    expect((await db.posting.findUniqueOrThrow({ where: { id: posting.id } })).state).toBe('PUBLISHED');
    expect(await db.stageTransition.count({ where: { opportunityId: first.opportunity.id } })).toBe(3);
  });
});
