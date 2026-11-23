import type { OrgKind } from '@prisma/client';
import { db } from '@/lib/db';
import { actorOf, emitEvent } from '@/server/events';
import { lockClientWrites } from '@/server/client-companies';
import { companyNameKey } from '@/lib/client-company';
import type { SessionContext } from '@/lib/session';
import { invalidateListMeta } from '@/server/lists/cache';

export async function setOrgKind(ctx: SessionContext, kind: OrgKind) {
  const result = await db.$transaction(async (tx) => {
    const org = await tx.organization.update({ where: { id: ctx.orgId }, data: { kind } });
    await emitEvent(tx, {
      orgId: ctx.orgId,
      ...actorOf(ctx),
      verb: 'org.kind_set',
      subjectType: 'organization',
      subjectId: ctx.orgId,
      payload: { kind },
    });
    return org;
  });
  invalidateListMeta(ctx.orgId);
  return result;
}

export async function completeOnboarding(ctx: SessionContext) {
  return db.organization.update({
    where: { id: ctx.orgId },
    data: { onboardedAt: new Date() },
  });
}

export async function removeDepartment(ctx: SessionContext, departmentId: string) {
  const dept = await db.department.findFirst({
    where: { id: departmentId, orgId: ctx.orgId },
  });
  if (!dept) throw new Error('Department not found');
  await db.department.delete({ where: { id: dept.id } }); // postings keep null via SetNull
  invalidateListMeta(ctx.orgId);
}

export type GroupKind = 'department' | 'client';

/**
 * Several departments or client companies at once (a pasted list, a
 * spreadsheet). A name the org already has, in any capitalization, is left
 * alone. Returns the ids created, so the form can offer to undo them.
 */
export async function addGroups(
  ctx: SessionContext,
  kind: GroupKind,
  names: string[],
): Promise<{ created: { id: string; name: string }[]; existing: number }> {
  const result = await db.$transaction(async (tx) => {
    if (kind === 'client') await lockClientWrites(tx, ctx.orgId);
    const current = kind === 'client'
      ? (await tx.clientCompany.findMany({
          where: { orgId: ctx.orgId }, select: { name: true, legalName: true },
        })).flatMap((item) => item.legalName ? [item.name, item.legalName] : [item.name])
      : (await tx.department.findMany({ where: { orgId: ctx.orgId }, select: { name: true } })).map((item) => item.name);
    const keyOf = kind === 'client' ? companyNameKey : (name: string) => name.toLowerCase();
    const have = new Set(current.map(keyOf));
    const wanted = new Map<string, string>();
    for (const raw of names) {
      const name = raw.trim();
      const key = keyOf(name);
      if (key && !wanted.has(key)) wanted.set(key, name);
    }
    const fresh = [...wanted].filter(([key]) => !have.has(key)).map(([, name]) => ({ orgId: ctx.orgId, name }));
    if (!fresh.length) return { created: [], existing: wanted.size };
    const rows = kind === 'client'
      ? await tx.clientCompany.createManyAndReturn({ data: fresh, skipDuplicates: true, select: { id: true, name: true } })
      : await tx.department.createManyAndReturn({ data: fresh, skipDuplicates: true, select: { id: true, name: true } });
    for (const row of rows) {
      await emitEvent(tx, {
        orgId: ctx.orgId,
        ...actorOf(ctx),
        verb: kind === 'client' ? 'client_company.created' : 'department.created',
        subjectType: kind === 'client' ? 'client_company' : 'department',
        subjectId: row.id,
        payload: { name: row.name },
      });
    }
    return { created: rows, existing: wanted.size - rows.length };
  });
  invalidateListMeta(ctx.orgId);
  return result;
}

/** Undo a bulk add, retaining client records and their posting history. */
export async function removeGroups(ctx: SessionContext, kind: GroupKind, ids: string[]) {
  const where = { orgId: ctx.orgId, id: { in: ids.slice(0, 500) } };
  if (kind === 'client') {
    await db.$transaction(async (tx) => {
      await lockClientWrites(tx, ctx.orgId);
      await tx.clientCompany.updateMany({ where, data: { active: false } });
    });
  }
  else await db.department.deleteMany({ where });
  invalidateListMeta(ctx.orgId);
}

export async function removeClientCompany(ctx: SessionContext, clientId: string) {
  await db.$transaction(async (tx) => {
    await lockClientWrites(tx, ctx.orgId);
    const result = await tx.clientCompany.updateMany({ where: { id: clientId, orgId: ctx.orgId }, data: { active: false } });
    if (!result.count) throw new Error('Client not found');
  });
  invalidateListMeta(ctx.orgId);
}
