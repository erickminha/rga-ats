import type { Prisma, StageType } from '@prisma/client';
import { db } from '@/lib/db';
import { actorOf, emitEvent } from '@/server/events';
import { isAdmin, type SessionContext } from '@/lib/session';
import { invalidateListMeta } from '@/server/lists/cache';
import { looseKey, nameKey } from '@/server/imports/mapping';
import { isRgaWorkspace } from '@/server/rga-workspace';
import { RGA_STAGES } from '@/server/rga-pipeline';
import { GROUP_RANK, stageGroup } from '@/lib/stage-types';

function requireStageAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx)) throw new Error('Somente administradores podem configurar as etapas.');
}

/**
 * A new stage goes at the end of its group: after the last lead, after the
 * last applicant, or at the end of the interview process just before Hired
 * (a new Hired stage goes last). Placing it by type instead would drop it
 * into the middle of a process someone has reordered.
 */
export async function createStage(ctx: SessionContext, name: string, type: StageType) {
  requireStageAdmin(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Stage name is required');
  const result = await db.$transaction(async (tx) => {
    const current = await lockStages(tx, ctx.orgId);
    if (current.some((s) => nameKey(s.name) === nameKey(trimmed))) {
      throw new Error(`There’s already a stage called “${trimmed}”`);
    }
    const group = stageGroup(type);
    let at = current.length;
    if (group !== 'interview') {
      const last = current.findLastIndex((s) => GROUP_RANK[stageGroup(s.type)] <= GROUP_RANK[group]);
      at = last + 1;
    } else if (type !== 'HIRED') {
      const hired = current.findIndex((s) => s.type === 'HIRED');
      if (hired >= 0) at = hired;
    }
    for (const [i, s] of current.entries()) await tx.stage.update({ where: { id: s.id }, data: { order: -1 - i } });
    const stage = await tx.stage.create({ data: { orgId: ctx.orgId, name: trimmed, type, order: at } });
    for (const [i, s] of current.entries()) {
      await tx.stage.update({ where: { id: s.id }, data: { order: i < at ? i : i + 1 } });
    }
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'stage.created',
      subjectType: 'stage',
      subjectId: stage.id,
      payload: { name: trimmed, type },
    });
    return stage;
  });
  invalidateListMeta(ctx.orgId);
  return result;
}

/**
 * The org's stages in order, row-locked like insertStages does so a
 * concurrent add or reorder waits instead of colliding on @@unique([orgId, order]).
 */
async function lockStages(tx: Prisma.TransactionClient, orgId: string) {
  // The organization row also serializes concurrent creation in an empty pipeline.
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Stage" WHERE "orgId" = ${orgId} FOR NO KEY UPDATE`;
  return tx.stage.findMany({ where: { orgId }, orderBy: { order: 'asc' } });
}

export async function renameStage(ctx: SessionContext, stageId: string, name: string) {
  requireStageAdmin(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Stage name is required');
  const result = await db.$transaction(async (tx) => {
    const stage = (await lockStages(tx, ctx.orgId)).find((row) => row.id === stageId);
    if (!stage) throw new Error('Stage not found');
    if (stage.name === trimmed) return stage;
    const updated = await tx.stage.update({ where: { id: stage.id }, data: { name: trimmed } });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'stage.renamed',
      subjectType: 'stage',
      subjectId: stage.id,
      payload: { from: stage.name, to: trimmed },
    });
    return updated;
  });
  invalidateListMeta(ctx.orgId);
  return result;
}

/**
 * The pipeline in a new order (a drag in the stage editor): `ids` is every
 * stage of the org. Leads stay before applicants and applicants before the
 * interview process whatever order arrives; within a group it's the caller's.
 */
export async function setStageOrder(ctx: SessionContext, ids: string[]) {
  requireStageAdmin(ctx);
  await db.$transaction(async (tx) => {
    const stages = await lockStages(tx, ctx.orgId);
    const byId = new Map(stages.map((s) => [s.id, s]));
    if (ids.length !== stages.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
      throw new Error('The stages changed while you were editing. Reload and try again.');
    }
    const ordered = ids
      .map((id, i) => ({ stage: byId.get(id)!, i }))
      .sort((a, b) => GROUP_RANK[stageGroup(a.stage.type)] - GROUP_RANK[stageGroup(b.stage.type)] || a.i - b.i)
      .map((x) => x.stage);
    if (ordered.every((s, i) => s.id === stages[i].id)) return;
    // Through negative temporaries so @@unique([orgId, order]) never trips mid-way.
    for (const [i, s] of stages.entries()) await tx.stage.update({ where: { id: s.id }, data: { order: -1 - i } });
    for (const [order, s] of ordered.entries()) await tx.stage.update({ where: { id: s.id }, data: { order } });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'stage.reordered',
      subjectType: 'organization', subjectId: ctx.orgId,
      payload: { from: stages.map(({ id }) => id), to: ordered.map(({ id }) => id) },
    });
  });
  invalidateListMeta(ctx.orgId);
}

export async function deleteStage(ctx: SessionContext, stageId: string) {
  requireStageAdmin(ctx);
  const result = await db.$transaction(async (tx) => {
    const stage = (await lockStages(tx, ctx.orgId)).find((row) => row.id === stageId);
    if (!stage) throw new Error('Stage not found');

    const stageCount = await tx.stage.count({ where: { orgId: ctx.orgId } });
    if (stageCount <= 1) throw new Error('At least one stage is required');

    const inUse = await tx.opportunity.count({ where: { stageId: stage.id } });
    if (inUse > 0) throw new Error(`Move the ${inUse} candidate(s) out of this stage first`);

    const history = await tx.stageTransition.count({
      where: { OR: [{ toStageId: stage.id }, { fromStageId: stage.id }] },
    });
    if (history > 0) throw new Error('This stage has candidate history and can only be renamed');

    await tx.stage.delete({ where: { id: stage.id } });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'stage.deleted',
      subjectType: 'stage',
      subjectId: stage.id,
      payload: { name: stage.name },
    });
  });
  invalidateListMeta(ctx.orgId);
  return result;
}

/** Configure only the selected, existing RGA agency. Stage IDs and references stay intact. */
export async function reconcileRgaStages(ctx: SessionContext) {
  requireStageAdmin(ctx);
  if (!isRgaWorkspace(ctx.orgId)) throw new Error('O funil RGA não está habilitado para esta organização.');

  const result = await db.$transaction(async (tx) => {
    const current = await lockStages(tx, ctx.orgId);
    const org = await tx.organization.findUnique({ where: { id: ctx.orgId }, select: { kind: true } });
    if (org?.kind !== 'AGENCY') throw new Error('Selecione o cadastro existente da agência RGA.');

    const official = RGA_STAGES.map(({ name, type, defaultName }) => {
      const matches = current.filter((stage) => looseKey(stage.name) === looseKey(name));
      if (!matches.length && defaultName) {
        matches.push(...current.filter((stage) => stage.type === type && nameKey(stage.name) === nameKey(defaultName)));
      }
      if (matches.length > 1 || matches.some((stage) => stage.type !== type)) {
        throw new Error(`Confira as etapas existentes antes de reconciliar “${name}”. Há nomes duplicados ou um tipo incompatível.`);
      }
      return { name, type, existing: matches[0] };
    });
    const matchedIds = new Set(official.flatMap(({ existing }) => existing ? [existing.id] : []));
    const leads = current.filter((stage) => stage.type === 'LEAD');
    const legacy = current.filter((stage) => stage.type !== 'LEAD' && !matchedIds.has(stage.id));
    const ordered = [
      ...leads.map((stage) => ({ name: stage.name, type: stage.type, existing: stage })),
      ...official,
      ...legacy.map((stage) => ({ name: stage.name, type: stage.type, existing: stage })),
    ];

    const changes = ordered.flatMap(({ name, type, existing }, order) =>
      existing?.name === name && existing.order === order ? [] : [{
        name, type, order,
        ...(existing ? { previous: { name: existing.name, order: existing.order } } : {}),
      }]);
    if (!changes.length) return { changed: false, legacy: legacy.map((stage) => stage.name) };

    const tempStart = Math.min(0, ...current.map((stage) => stage.order)) - current.length;
    for (const [index, stage] of current.entries()) {
      await tx.stage.update({ where: { id: stage.id }, data: { order: tempStart + index } });
    }
    for (const [order, { name, type, existing }] of ordered.entries()) {
      const stage = existing
        ? await tx.stage.update({ where: { id: existing.id }, data: { name, order } })
        : await tx.stage.create({ data: { orgId: ctx.orgId, name, type, order } });
      const change = changes.find((item) => item.order === order);
      if (change) Object.assign(change, { id: stage.id });
    }
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'stage.rga_pipeline_reconciled',
      subjectType: 'organization', subjectId: ctx.orgId,
      payload: { changes, legacyStageIds: legacy.map((stage) => stage.id) },
    });
    return { changed: true, legacy: legacy.map((stage) => stage.name) };
  });
  if (result.changed) invalidateListMeta(ctx.orgId);
  return result;
}
