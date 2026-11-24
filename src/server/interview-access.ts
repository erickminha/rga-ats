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

/** Match the kit: use the application file when available, otherwise the profile file. */
export function resumeAccess(ctx: SessionContext): Prisma.StoredFileWhereInput {
  const assigned = { orgId: ctx.orgId, interviews: { some: interviewAccess(ctx) } };
  return {
    orgId: ctx.orgId,
    deletePendingAt: null,
    ...(canManageRecruiting(ctx) ? {} : {
      OR: [
        { applicationResumes: { some: assigned } },
        { contacts: { some: {
          orgId: ctx.orgId, isAnonymized: false,
          opportunities: { some: { ...assigned, OR: [
            { applicationResumeId: null },
            { applicationResume: { deletePendingAt: { not: null } } },
            { applicationResume: { orgId: { not: ctx.orgId } } },
          ] } },
        } } },
      ],
    }),
  };
}
