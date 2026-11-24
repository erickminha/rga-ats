import type { Prisma } from '@prisma/client';
import { canManageRecruiting, type SessionContext } from '@/lib/session';

/** Restricted profiles only see their assigned, non-canceled interviews. */
export function interviewAccess(ctx: SessionContext): Prisma.InterviewWhereInput {
  return {
    orgId: ctx.orgId,
    opportunity: { orgId: ctx.orgId, contact: { orgId: ctx.orgId, isAnonymized: false } },
    ...(canManageRecruiting(ctx) ? {} : {
      state: { not: 'CANCELED' },
      panelists: { some: { id: ctx.userId ?? '', orgId: ctx.orgId, deactivatedAt: null } },
    }),
  };
}

/** Only the current resume of an assigned candidate, never their other files. */
export function resumeAccess(ctx: SessionContext): Prisma.StoredFileWhereInput {
  return {
    orgId: ctx.orgId,
    ...(canManageRecruiting(ctx) ? {} : {
      contacts: { some: {
        orgId: ctx.orgId, isAnonymized: false,
        opportunities: { some: { orgId: ctx.orgId, interviews: { some: interviewAccess(ctx) } } },
      } },
    }),
  };
}
