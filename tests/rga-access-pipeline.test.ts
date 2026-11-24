import proxy from '@/proxy';
import { createRecruitingShare } from '@/server/share-links';
import { interviewAccess, resumeAccess } from '@/server/interview-access';
import { submitFeedback } from '@/server/feedback';
import { setInterviewState } from '@/server/interviews';
import { updateContactDetails } from '@/server/contacts';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessRole } from '@prisma/client';
import { db } from '@/lib/db';
import { handlers } from '@/lib/auth';
import type { SessionContext } from '@/lib/session';
import { submitApplication } from '@/server/applications';
import { saveClientCompany, setPostingClient, setPublicClientIdentity } from '@/server/client-companies';
import { parseCompany } from '@/lib/client-company';
import { createCandidate, moveStage } from '@/server/opportunities';
import { createPosting, setPostingState, updatePostingDetails } from '@/server/postings';
import { createStage, deleteStage, reconcileRgaStages, renameStage, setStageOrder } from '@/server/stages';
import { inviteUser, setUserActive, setUserRole } from '@/server/team';
import { allowsAutomaticScheduling } from '@/server/rga-pipeline';
import { candidate, createOrg } from './fixtures';
import { hasDb } from './setup';

const origin = 'https://rga.example.invalid';
const password = 'senha-ficticia-de-teste';

async function logIn(email: string, secret = password) {
  const csrf = await handlers.GET(new NextRequest(origin + '/api/auth/csrf'));
  const { csrfToken } = await csrf.json();
  const cookie = csrf.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const response = await handlers.POST(new NextRequest(origin + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: secret, csrfToken }),
  }));
  const session = response.headers.getSetCookie().find((value) => value.startsWith('__Secure-authjs.session-token='));
  expect(session).toBeDefined();
  return session!.split(';')[0];
}

async function sessionWith(cookie: string) {
  const response = await handlers.GET(new NextRequest(origin + '/api/auth/session', { headers: { cookie } }));
  return response.json() as Promise<{ user?: { id: string; orgId: string; accessRole: AccessRole } } | null>;
}

function context(user: { id: string; orgId: string; accessRole: AccessRole }): SessionContext {
  return { userId: user.id, orgId: user.orgId, accessRole: user.accessRole };
}

async function activeUser(orgId: string, accessRole: AccessRole) {
  return db.user.create({
    data: {
      orgId, name: 'Pessoa fictícia', accessRole, email: `${crypto.randomUUID()}@example.invalid`,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
}

describe.skipIf(!hasDb)('Perfis e funil RGA', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('separates authenticated roles and revokes existing sessions after role and activation changes', async () => {
    vi.stubEnv('AUTH_URL', origin);
    vi.stubEnv('RGA_SINGLE_WORKSPACE', 'true');
    const { org, admin, stages } = await createOrg();
    const root = await db.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
    const users = await Promise.all((['ADMIN', 'TEAM_MEMBER', 'LIMITED_TEAM_MEMBER', 'INTERVIEWER'] as const).map((role) => activeUser(org.id, role)));
    const [superCtx, adminCtx, recruiterCtx, limitedCtx, interviewerCtx] = await Promise.all([root, ...users].map(async (row) => {
      const authenticated = await sessionWith(await logIn(row.email));
      expect(authenticated?.user).toMatchObject({ id: row.id, orgId: org.id, accessRole: row.accessRole });
      return context(authenticated!.user!);
    }));
    await expect(setUserRole(adminCtx, adminCtx.userId!, 'SUPER_ADMIN')).rejects.toThrow(/administrador principal/);
    await expect(setUserRole(adminCtx, recruiterCtx.userId!, 'SUPER_ADMIN')).rejects.toThrow(/administrador principal/);
    await expect(inviteUser(adminCtx, { email: 'principal@example.invalid', name: 'Pessoa fictícia', accessRole: 'SUPER_ADMIN' })).rejects.toThrow(/administrador principal/);
    await expect(setUserActive(adminCtx, superCtx.userId!, false)).rejects.toThrow(/administrador principal/);
    await expect(setUserRole(superCtx, superCtx.userId!, 'TEAM_MEMBER')).rejects.toThrow(/pelo menos um/);
    await expect(setUserActive(superCtx, superCtx.userId!, false)).rejects.toThrow(/pelo menos um/);
    await expect(setUserRole(recruiterCtx, recruiterCtx.userId!, 'ADMIN')).rejects.toThrow(/administradores/);
    for (const ctx of [recruiterCtx, limitedCtx, interviewerCtx]) {
      await expect(createStage(ctx, 'Etapa restrita', 'SCREEN')).rejects.toThrow(/administradores/);
      await expect(renameStage(ctx, stages[0].id, 'Renomeada')).rejects.toThrow(/administradores/);
      await expect(setStageOrder(ctx, stages.map(({ id }) => id))).rejects.toThrow(/administradores/);
      await expect(deleteStage(ctx, stages[0].id)).rejects.toThrow(/administradores/);
    }
    const temporaryStage = await createStage(adminCtx, 'Etapa administrada', 'SCREEN');
    await deleteStage(superCtx, temporaryStage.id);

    const invitedEmail = `${crypto.randomUUID()}@example.invalid`;
    const { tempPassword } = await inviteUser(adminCtx, { email: invitedEmail, name: 'Convidada fictícia', accessRole: 'TEAM_MEMBER' });
    expect((await sessionWith(await logIn(invitedEmail, tempPassword)))?.user).toMatchObject({ orgId: org.id, accessRole: 'TEAM_MEMBER' });
    const recruiter = users[1];
    const previous = await logIn(recruiter.email);
    await setUserRole(superCtx, recruiter.id, 'ADMIN');
    expect((await sessionWith(previous))?.user).toBeUndefined();
    const next = await logIn(recruiter.email);
    expect((await sessionWith(next))?.user?.accessRole).toBe('ADMIN');
    await setUserActive(superCtx, recruiter.id, false);
    await setUserActive(superCtx, recruiter.id, true);
    expect((await sessionWith(next))?.user).toBeUndefined();
    expect((await db.user.findUniqueOrThrow({ where: { id: recruiter.id } })).sessionVersion).toBe(3);
    const roleEvents = await db.event.count({ where: { orgId: org.id, subjectId: recruiter.id, verb: 'user.role_changed' } });
    expect(roleEvents).toBe(1);
  });

  it('limits authenticated restricted profiles to assigned interview kits, resumes and feedback', async () => {
    vi.stubEnv('AUTH_URL', origin);
    const { org, stages, admin } = await createOrg();
    const [assigned, other] = await Promise.all([candidate(org.id, stages, [[0, 0]]), candidate(org.id, stages, [[0, 0]])]);
    const makeResume = async (contactId: string) => {
      const file = await db.storedFile.create({ data: { orgId: org.id, contactId, key: crypto.randomUUID(), filename: 'ficticio.pdf', mime: 'application/pdf', size: 1 } });
      await db.contact.update({ where: { id: contactId }, data: { resumeFileId: file.id } });
      return file;
    };
    const [allowedFile, deniedFile] = await Promise.all([makeResume(assigned.contact.id), makeResume(other.contact.id)]);
    const applicationFile = (contactId: string) => db.storedFile.create({
      data: { orgId: org.id, contactId, key: crypto.randomUUID(), filename: 'curriculo-candidatura.pdf', mime: 'application/pdf', size: 1 },
    });
    const [assignedResume, otherResume] = await Promise.all([applicationFile(assigned.contact.id), applicationFile(assigned.contact.id)]);
    await db.opportunity.update({ where: { id: assigned.opportunity.id }, data: { applicationResumeId: assignedResume.id } });
    await db.opportunity.create({
      data: { orgId: org.id, contactId: assigned.contact.id, stageId: stages[0].id, applicationResumeId: otherResume.id },
    });
    const people = await Promise.all([activeUser(org.id, 'LIMITED_TEAM_MEMBER'), activeUser(org.id, 'INTERVIEWER')]);
    const interview = (opportunityId: string, panelists: { id: string }[]) => db.interview.create({ data: {
      orgId: org.id, opportunityId, panelists: { connect: panelists.map(({ id }) => ({ id })) }, title: 'Entrevista fictícia', startAt: new Date(),
    } });
    const included = await interview(assigned.opportunity.id, people);
    const excluded = await interview(other.opportunity.id, []);
    const protect = proxy as unknown as (request: NextRequest) => Promise<Response>;
    for (const user of people) {
      const cookie = await logIn(user.email);
      const authenticated = (await sessionWith(cookie))?.user;
      expect(authenticated?.accessRole).toBe(user.accessRole);
      const ctx = context(authenticated!);
      for (const path of ['/search', '/contacts', '/pipeline', `/candidates/${other.opportunity.id}`]) {
        const response = await protect(new NextRequest(origin + path, { headers: { cookie } }));
        expect(new URL(response.headers.get('location')!).pathname).toBe('/interviews');
      }
      expect((await protect(new NextRequest(origin + '/api/lists/contacts', { headers: { cookie } }))).status).toBe(403);
      expect(await db.interview.findMany({ where: interviewAccess(ctx), select: { id: true } })).toEqual([{ id: included.id }]);
      expect(await db.storedFile.findFirst({ where: { ...resumeAccess(ctx), id: deniedFile.id } })).toBeNull();
      expect(await db.storedFile.findFirst({ where: { ...resumeAccess(ctx), id: assignedResume.id } })).not.toBeNull();
      expect(await db.storedFile.findFirst({ where: { ...resumeAccess(ctx), id: otherResume.id } })).toBeNull();
      expect(await db.storedFile.findFirst({ where: { ...resumeAccess(ctx), id: allowedFile.id } })).toBeNull();
      const feedback = { summary: 'Avaliação fictícia', overallRating: 3 };
      await expect(submitFeedback(ctx, { ...feedback, opportunityId: other.opportunity.id, interviewId: excluded.id })).rejects.toThrow();
      await expect(submitFeedback(ctx, { ...feedback, opportunityId: assigned.opportunity.id })).rejects.toThrow();
      expect((await submitFeedback(ctx, { ...feedback, opportunityId: assigned.opportunity.id, interviewId: included.id })).authorId).toBe(user.id);
      await expect(setInterviewState(ctx, included.id, 'COMPLETED')).rejects.toThrow(/perfil/);
      await expect(updateContactDetails(ctx, assigned.contact.id, { location: 'Recife' })).rejects.toThrow(/perfil/);
      for (const scope of ['candidate', 'posting', 'client'] as const) {
        expect(await createRecruitingShare(ctx, scope, assigned.opportunity.id)).toHaveProperty('error');
      }
    }
    await db.storedFile.update({ where: { id: assignedResume.id }, data: { deletePendingAt: new Date() } });
    expect(await db.storedFile.findFirst({ where: { ...resumeAccess(context(people[0])), id: allowedFile.id } })).not.toBeNull();
    expect(await db.storedFile.findFirst({ where: { ...resumeAccess(context(people[0])), id: assignedResume.id } })).toBeNull();
    expect((await setInterviewState(context(admin), included.id, 'COMPLETED')).state).toBe('COMPLETED');
    await db.interview.update({ where: { id: included.id }, data: { panelists: { disconnect: { id: people[0].id } } } });
    expect(await db.storedFile.findFirst({ where: { ...resumeAccess(context(people[0])), id: allowedFile.id } })).toBeNull();
    const recruiter = context(await activeUser(org.id, 'TEAM_MEMBER'));
    expect(await createRecruitingShare(recruiter, 'candidate', assigned.opportunity.id)).toHaveProperty('code');
    await db.opportunity.update({ where: { id: assigned.opportunity.id }, data: { confidential: true } });
    expect(await createRecruitingShare(recruiter, 'candidate', assigned.opportunity.id)).toHaveProperty('error');
    expect(await db.storedFile.findFirst({ where: { ...resumeAccess(recruiter), id: deniedFile.id } })).not.toBeNull();
  });

  it('serializes simultaneous attempts to remove the last two active principal administrators', async () => {
    const { org, admin } = await createOrg();
    const second = await activeUser(org.id, 'SUPER_ADMIN');
    const results = await Promise.allSettled([
      setUserRole(context(admin), admin.id, 'ADMIN'),
      setUserRole(context(second), second.id, 'ADMIN'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.user.count({ where: { orgId: org.id, accessRole: 'SUPER_ADMIN', deactivatedAt: null } })).toBe(1);
  });

  it('allows recruitment operations without granting publication approval or client disclosure', async () => {
    const { org, admin } = await createOrg();
    await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY', requirePostingApproval: true } });
    const ctx = context(await activeUser(org.id, 'TEAM_MEMBER'));
    const restricted = context(await activeUser(org.id, 'INTERVIEWER'));
    const company = new FormData();
    company.set('name', 'Empresa fictícia');
    const client = await saveClientCompany(ctx, null, parseCompany(company));
    company.set('city', 'Recife');
    expect((await saveClientCompany(ctx, client.id, parseCompany(company))).city).toBe('Recife');
    const input = { title: 'Vaga fictícia', workplaceType: 'REMOTE', commitment: 'FULL_TIME' } as const;
    await expect(createPosting(restricted, input)).rejects.toThrow(/perfil/);
    const posting = await createPosting(ctx, { ...input, clientCompanyId: client.id });
    const requirements = ['Requisito fictício'];
    await db.posting.update({ where: { id: posting.id }, data: { content: { requirements } } });
    const edited = await updatePostingDetails(ctx, posting.id, { ...input, title: 'Vaga editada', description: 'Descrição fictícia' });
    expect(edited).toMatchObject({ slug: posting.slug, state: 'DRAFT', clientCompanyId: client.id, content: { requirements, description: 'Descrição fictícia' } });
    await expect(setPublicClientIdentity(ctx, posting.id, client.id, true)).rejects.toThrow(/administradores/);
    expect((await setPostingState(ctx, posting.id, 'PUBLISHED')).state).toBe('PENDING_APPROVAL');
    expect(await createRecruitingShare(ctx, 'posting', posting.id)).toHaveProperty('error');
    expect(await createRecruitingShare(ctx, 'client', client.id)).toHaveProperty('error');
    await expect(setPostingState(ctx, posting.id, 'DRAFT')).rejects.toThrow(/administradores/);
    await expect(setPostingState(restricted, posting.id, 'PUBLISHED')).rejects.toThrow(/perfil/);
    expect((await setPostingState(context(admin), posting.id, 'PUBLISHED')).state).toBe('PUBLISHED');
    await expect(updatePostingDetails(ctx, posting.id, { ...input, title: 'Mudança sem aprovação' })).rejects.toThrow(/administradores/);
    await expect(setPostingClient(ctx, posting.id, null)).rejects.toThrow(/administradores/);
    expect(await createRecruitingShare(ctx, 'posting', posting.id)).toHaveProperty('code');
    expect(await createRecruitingShare(ctx, 'client', client.id)).toHaveProperty('code');
  });

  it('reconciles only the configured agency, keeps existing references, and uses Candidatura for new public applications', async () => {
    vi.stubEnv('RGA_SINGLE_WORKSPACE', 'true');
    const { org, admin, stages } = await createOrg(['New applicant', 'Phone screen', 'On-site', 'Offer', 'Hired']);
    const foreign = await createOrg();
    vi.stubEnv('RGA_WORKSPACE_ID', org.id);
    await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY', autoScheduleOnInterviewStages: true } });
    const lead = await db.stage.create({ data: { orgId: org.id, name: 'Prospecção', type: 'LEAD', order: 5 } });
    const ctx = context(admin);
    const recruiter = context(await activeUser(org.id, 'TEAM_MEMBER'));
    const posting = await db.posting.create({ data: { orgId: org.id, title: 'Vaga fictícia', slug: 'vaga-ficticia', state: 'PUBLISHED' } });
    const oldCandidate = await candidate(org.id, stages, [[0, 0], [3, 2]], { postingId: posting.id });
    const before = await db.stageTransition.findMany({ where: { opportunityId: oldCandidate.opportunity.id }, orderBy: { occurredAt: 'asc' } });
    await expect(reconcileRgaStages(context(foreign.admin))).rejects.toThrow(/não está habilitado/);
    await expect(reconcileRgaStages(recruiter)).rejects.toThrow(/administradores/);
    expect(await reconcileRgaStages(ctx)).toEqual({ changed: true, legacy: ['Offer'] });
    const ordered = await db.stage.findMany({ where: { orgId: org.id }, orderBy: { order: 'asc' } });
    expect(ordered.map(({ name, type }) => [name, type])).toEqual([
      ['Prospecção', 'LEAD'], ['Candidatura', 'APPLICANT'], ['Triagem', 'SCREEN'], ['Entrevista', 'ONSITE'],
      ['Finalistas', 'ONSITE'], ['Avaliação DISC', 'ONSITE'], ['Parecer', 'ONSITE'],
      ['Apresentação ao cliente', 'ONSITE'], ['Contratação', 'HIRED'], ['Offer', 'OFFER'],
    ]);
    expect(ordered[0].id).toBe(lead.id);
    expect(ordered[1].id).toBe(stages[0].id);
    expect(ordered[9].id).toBe(stages[3].id);
    expect(await db.stageTransition.findMany({ where: { opportunityId: oldCandidate.opportunity.id }, orderBy: { occurredAt: 'asc' } })).toEqual(before);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oldCandidate.opportunity.id } })).stageId).toBe(stages[3].id);
    expect((await db.posting.findUniqueOrThrow({ where: { id: posting.id } })).state).toBe('PUBLISHED');
    expect(await reconcileRgaStages(ctx)).toEqual({ changed: false, legacy: ['Offer'] });
    expect(await db.stage.count({ where: { orgId: org.id } })).toBe(10);
    expect(await db.stage.count({ where: { orgId: foreign.org.id } })).toBe(foreign.stages.length);
    expect(await db.event.count({ where: { orgId: org.id, verb: 'stage.rga_pipeline_reconciled' } })).toBe(1);

    const applied = await submitApplication({ orgSlug: org.slug, postingSlug: posting.slug, name: 'Candidata fictícia', email: 'candidatura@example.invalid' });
    expect(applied.stageId).toBe(ordered[1].id);
    const limited = context(await activeUser(org.id, 'LIMITED_TEAM_MEMBER'));
    await expect(moveStage(limited, applied.id, ordered[4].id)).rejects.toThrow(/perfil/);
    const manualInput = {
      name: 'Pessoa fictícia',
      email: 'curriculo@example.invalid',
      origin: 'SOURCED',
      stageId: lead.id,
      resume: { filename: 'curriculo-teste.txt', data: Buffer.from('Currículo fictício com experiência em atividades administrativas.') },
    } as const;
    const manual = await createCandidate(recruiter, manualInput);
    expect(manual.stageId).toBe(lead.id);
    const contact = await db.contact.findUniqueOrThrow({ where: { id: manual.contactId }, include: { resumeFile: true } });
    expect(contact.resumeFile).toMatchObject({ orgId: org.id, contactId: contact.id, filename: 'curriculo-teste.txt' });
    expect(contact.resumeText).toContain('experiência');
    const files = await db.storedFile.count({ where: { orgId: org.id } });
    const distinctPosting = await db.posting.create({ data: { orgId: org.id, title: 'Segunda vaga fictícia', slug: 'segunda-vaga-ficticia' } });
    const another = await createCandidate(recruiter, {
      ...manualInput, postingId: distinctPosting.id,
      resume: { filename: 'segunda-versao.txt', data: Buffer.from('Segundo currículo fictício') },
    });
    expect(another.contactId).toBe(manual.contactId);
    expect(another.applicationResumeId).not.toBe(manual.applicationResumeId);
    expect(await db.contact.findUnique({ where: { id: manual.contactId } })).toMatchObject({ resumeFileId: manual.applicationResumeId });
    await db.recruitingAssessment.create({ data: { opportunityId: manual.id, opinion: { recommendation: 'Parecer fictício' } } });
    expect(await db.recruitingAssessment.findUnique({ where: { opportunityId: another.id } })).toBeNull();
    expect(await db.storedFile.count({ where: { orgId: org.id } })).toBe(files + 1);
    expect((await moveStage(recruiter, applied.id, ordered[4].id)).status).toBe('ACTIVE');
    expect((await moveStage(recruiter, applied.id, ordered[7].id)).status).toBe('ACTIVE');
    expect((await moveStage(recruiter, applied.id, ordered[8].id)).status).toBe('HIRED');
    const history = await db.stageTransition.findMany({ where: { opportunityId: applied.id }, orderBy: { occurredAt: 'asc' } });
    expect(history.map(({ toStageId }) => toStageId)).toEqual([ordered[1].id, ordered[4].id, ordered[7].id, ordered[8].id]);
    expect(await db.schedulingLink.count({ where: { opportunityId: applied.id } })).toBe(0);
    expect(allowsAutomaticScheduling(org.id, ordered[2])).toBe(true);
    expect(allowsAutomaticScheduling(org.id, ordered[3])).toBe(true);
    expect(allowsAutomaticScheduling(foreign.org.id, ordered[4])).toBe(true);
  });

  it('stops reconciliation for an incompatible existing stage without altering its pipeline', async () => {
    const { org, admin, stages } = await createOrg();
    vi.stubEnv('RGA_WORKSPACE_ID', org.id);
    await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY' } });
    await db.stage.update({ where: { id: stages[3].id }, data: { name: 'Avaliação DISC' } });
    await expect(reconcileRgaStages(context(admin))).rejects.toThrow(/tipo incompatível/);
    expect(await db.stage.count({ where: { orgId: org.id } })).toBe(stages.length);
  });
});
