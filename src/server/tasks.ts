import { db } from '@/lib/db';
import { actorOf, emitEvent } from '@/server/events';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { invalidatePipelineCounts } from '@/server/lists/cache';

/** Tasks (assignable to-dos) and candidate snooze. */

export async function createTask(
  ctx: SessionContext,
  input: { title: string; opportunityId?: string; assigneeId?: string; dueAt?: Date },
) {
  requireRecruitingAccess(ctx);
  const title = input.title.trim();
  if (!title || title.length > 300 || (input.dueAt && !Number.isFinite(+input.dueAt))) throw new Error('Confira o título e o prazo da tarefa.');
  return db.$transaction(async (tx) => {
    if (input.opportunityId) {
      const opp = await tx.opportunity.findFirst({
        where: { id: input.opportunityId, orgId: ctx.orgId, confidential: false, contact: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false } },
        select: { id: true },
      });
      if (!opp) throw new Error('Opportunity not found');
    }
    if (input.assigneeId) {
      const assignee = await tx.user.findFirst({
        where: { id: input.assigneeId, orgId: ctx.orgId, deactivatedAt: null },
        select: { id: true },
      });
      if (!assignee) throw new Error('Assignee not found');
    }
    const task = await tx.task.create({
      data: {
        orgId: ctx.orgId,
        opportunityId: input.opportunityId ?? null,
        assigneeId: input.assigneeId ?? ctx.userId,
        creatorId: ctx.userId,
        title,
        dueAt: input.dueAt ?? null,
      },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'task.created',
      subjectType: input.opportunityId ? 'opportunity' : 'task',
      subjectId: input.opportunityId ?? task.id,
      payload: { title },
    });
    return task;
  });
}

export async function updateTask(ctx: SessionContext, taskId: string,
  input: { title: string; assigneeId?: string; dueAt?: Date }) {
  requireRecruitingAccess(ctx);
  const title = input.title.trim();
  if (!title || title.length > 300 || (input.dueAt && !Number.isFinite(+input.dueAt))) throw new Error('Confira o título e o prazo da tarefa.');
  return db.$transaction(async tx => {
    const task = await tx.task.findFirst({where:{id:taskId,...taskScope(ctx.orgId)}});
    if (!task) throw new Error('Tarefa indisponível.');
    if (input.assigneeId && !await tx.user.findFirst({where:{id:input.assigneeId,orgId:ctx.orgId,deactivatedAt:null},select:{id:true}}))
      throw new Error('Responsável indisponível.');
    const updated = await tx.task.update({where:{id:task.id},data:{title,assigneeId:input.assigneeId??ctx.userId,dueAt:input.dueAt??null}});
    await emitEvent(tx,{orgId:ctx.orgId,...actorOf(ctx),verb:'task.updated',subjectType:task.opportunityId?'opportunity':'task',
      subjectId:task.opportunityId??task.id,payload:{taskId:task.id}});
    return updated;
  });
}

export function taskScope(orgId: string) {
  return {orgId,OR:[{opportunityId:null},{opportunity:{orgId,confidential:false,contact:{orgId,isAnonymized:false,retentionHold:false}}}]};
}

export async function setTaskCompleted(ctx: SessionContext, taskId: string, completed: boolean) {
  requireRecruitingAccess(ctx);
  if (typeof completed !== 'boolean') throw new Error('Situação inválida.');
  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, ...taskScope(ctx.orgId) } });
    if (!task) throw new Error('Tarefa indisponível.');
    const changed = await tx.task.updateMany({where:{id:task.id,orgId:ctx.orgId,completedAt:completed?null:{not:null}},
      data:{completedAt:completed?new Date():null}});
    if (changed.count) await emitEvent(tx,{
      orgId:ctx.orgId,...actorOf(ctx),verb:completed?'task.completed':'task.reopened',
      subjectType:task.opportunityId?'opportunity':'task',subjectId:task.opportunityId??task.id,payload:{taskId:task.id,title:task.title},
    });
    return tx.task.findUniqueOrThrow({where:{id:task.id}});
  });
}

export async function snoozeOpportunity(
  ctx: SessionContext,
  opportunityId: string,
  until: Date | null,
) {
  const updated = await db.$transaction(async (tx) => {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: opportunityId, orgId: ctx.orgId },
      include: { contact: true },
    });
    if (!opportunity) throw new Error('Opportunity not found');
    const updated = await tx.opportunity.update({
      where: { id: opportunity.id },
      data: { snoozedUntil: until },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: until ? 'opportunity.snoozed' : 'opportunity.unsnoozed',
      subjectType: 'opportunity',
      subjectId: opportunity.id,
      payload: {
        contactName: opportunity.contact.name,
        ...(until ? { until: until.toISOString() } : {}),
      },
    });
    return updated;
  });
  invalidatePipelineCounts(ctx.orgId);
  return updated;
}
