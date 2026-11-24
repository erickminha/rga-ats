import type { Prisma } from '@prisma/client';
import { isAdmin, type SessionContext } from '@/lib/session';

export function mayEditPostingDetails(ctx: SessionContext, state: string, requiresApproval: boolean) {
  return isAdmin(ctx) || state !== 'PUBLISHED' || !requiresApproval;
}

export async function lockPostingForEdit(tx: Prisma.TransactionClient, ctx: SessionContext, id: string) {
  await tx.$queryRaw`SELECT id FROM "Posting" WHERE id = ${id} AND "orgId" = ${ctx.orgId} FOR NO KEY UPDATE`;
  return tx.posting.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { org: { select: { slug: true, requirePostingApproval: true } } },
  });
}
