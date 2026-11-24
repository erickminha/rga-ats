import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { AccessRole, type Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { actorOf, emitEvent } from '@/server/events';
import { isAdmin, type SessionContext } from '@/lib/session';

export class TeamError extends Error {}

/** Serialize team changes for the organization and re-check the acting user under the lock. */
async function lockTeam(tx: Prisma.TransactionClient, ctx: SessionContext) {
  if (!ctx.userId || !isAdmin(ctx)) throw new TeamError('Apenas administradores podem gerenciar a equipe.');
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${ctx.orgId} FOR NO KEY UPDATE`;
  const actor = await tx.user.findFirst({
    where: { id: ctx.userId, orgId: ctx.orgId, deactivatedAt: null },
    select: { accessRole: true },
  });
  if (actor?.accessRole !== ctx.accessRole) throw new TeamError('Suas permissões mudaram. Entre novamente.');
  return actor.accessRole;
}

function checkRole(actor: AccessRole, role: AccessRole) {
  if (!Object.hasOwn(AccessRole, role)) throw new TeamError('Perfil de acesso inválido.');
  if (role === 'SUPER_ADMIN' && actor !== 'SUPER_ADMIN') {
    throw new TeamError('Somente um administrador principal pode gerenciar esse perfil.');
  }
}

async function ensureAnotherSuperAdmin(tx: Prisma.TransactionClient, orgId: string, userId: string) {
  const other = await tx.user.findFirst({
    where: { orgId, id: { not: userId }, accessRole: 'SUPER_ADMIN', deactivatedAt: null },
    select: { id: true },
  });
  if (!other) throw new TeamError('Mantenha pelo menos um administrador principal ativo.');
}

/** Invites use a temporary password and leave an audit event. */
export async function inviteUser(
  ctx: SessionContext,
  input: { email: string; name: string; accessRole: AccessRole },
): Promise<{ tempPassword: string }> {
  if (!isAdmin(ctx)) throw new TeamError('Apenas administradores podem gerenciar a equipe.');
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new TeamError('Informe o nome e um e-mail válido.');
  const tempPassword = randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.$transaction(async (tx) => {
    const actor = await lockTeam(tx, ctx);
    checkRole(actor, input.accessRole);
    if (await tx.user.findUnique({ where: { orgId_email: { orgId: ctx.orgId, email } }, select: { id: true } })) {
      throw new TeamError('Já existe uma pessoa com este e-mail na equipe.');
    }
    const user = await tx.user.create({
      data: { orgId: ctx.orgId, email, name, passwordHash, accessRole: input.accessRole },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'user.invited', subjectType: 'user', subjectId: user.id,
      payload: { email, accessRole: input.accessRole },
    });
  });
  return { tempPassword };
}

export async function setUserRole(ctx: SessionContext, userId: string, accessRole: AccessRole) {
  return db.$transaction(async (tx) => {
    const actor = await lockTeam(tx, ctx);
    checkRole(actor, accessRole);
    const user = await tx.user.findFirst({ where: { id: userId, orgId: ctx.orgId } });
    if (!user) throw new TeamError('Pessoa não encontrada nesta organização.');
    checkRole(actor, user.accessRole);
    if (user.accessRole === accessRole) return user;
    if (user.accessRole === 'SUPER_ADMIN' && !user.deactivatedAt) {
      await ensureAnotherSuperAdmin(tx, ctx.orgId, user.id);
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { accessRole, sessionVersion: { increment: 1 } },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'user.role_changed', subjectType: 'user', subjectId: user.id,
      payload: { email: user.email, previousRole: user.accessRole, accessRole },
    });
    return updated;
  });
}

export async function setUserActive(ctx: SessionContext, userId: string, active: boolean) {
  return db.$transaction(async (tx) => {
    const actor = await lockTeam(tx, ctx);
    const user = await tx.user.findFirst({ where: { id: userId, orgId: ctx.orgId } });
    if (!user) throw new TeamError('Pessoa não encontrada nesta organização.');
    checkRole(actor, user.accessRole);
    if (active === !user.deactivatedAt) return user;
    if (!active) {
      if (user.accessRole === 'SUPER_ADMIN') await ensureAnotherSuperAdmin(tx, ctx.orgId, user.id);
      if (userId === ctx.userId) throw new TeamError('Peça a outro administrador para desativar sua conta.');
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { deactivatedAt: active ? null : new Date(), sessionVersion: { increment: 1 } },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: active ? 'user.reactivated' : 'user.deactivated',
      subjectType: 'user', subjectId: user.id, payload: { email: user.email },
    });
    return updated;
  });
}
