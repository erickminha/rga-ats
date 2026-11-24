import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { submitApplication } from '@/server/applications';
import { createPosting, setPostingState } from '@/server/postings';
import { scheduleInterview, setInterviewState } from '@/server/interviews';
import { moveStage } from '@/server/opportunities';
import { saveRecruitingAssessment, type AssessmentPart } from '@/server/recruiting-assessment';
import { createShortlistShare, readShortlistShare, resolveShare, revokeRecruitingShares } from '@/server/share-links';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

describe.skipIf(!hasDb)('operação RGA por vaga', () => {
  it('keeps resumes and assessments per application and shares only explicitly approved finalist information', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const client = await db.clientCompany.create({ data: { orgId: org.id, name: 'Cliente fictício' } });
    const first = await createPosting(ctx, { title: 'Vaga A', workplaceType: 'REMOTE', commitment: 'FULL_TIME', clientCompanyId: client.id });
    const second = await createPosting(ctx, { title: 'Vaga B', workplaceType: 'REMOTE', commitment: 'FULL_TIME', clientCompanyId: client.id });
    await setPostingState(ctx, first.id, 'PUBLISHED');
    await setPostingState(ctx, second.id, 'PUBLISHED');
    const applicant = { orgSlug: org.slug, name: 'Pessoa Fictícia', email: 'privado@example.invalid' };
    const apply = (slug: string, filename: string) => submitApplication({
      ...applicant, postingSlug: slug, resume: { filename, data: Buffer.from('Currículo fictício para a vaga: ' + slug) },
    });
    const a = await apply(first.slug, 'primeiro.txt');
    const b = await apply(second.slug, 'segundo.txt');
    expect(a.contactId).toBe(b.contactId);
    expect(a.applicationResumeId).toBeTruthy();
    expect(b.applicationResumeId).not.toBe(a.applicationResumeId);
    const save = (id: string, part: AssessmentPart, values: Record<string, string>) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      return saveRecruitingAssessment(ctx, id, part, form);
    };
    await save(a.id, 'screening', { result: 'ADVANCE', notes: 'Anotação interna' });
    const interview = await scheduleInterview(ctx, {
      opportunityId: a.id, title: 'Entrevista fictícia', startAt: new Date(), durationMins: 30, panelistIds: [admin.id],
    });
    await setInterviewState(ctx, interview.id, 'COMPLETED');
    await db.stage.update({ where: { id: stages[2].id }, data: { name: 'Finalistas' } });
    await moveStage(ctx, a.id, stages[2].id);
    await save(a.id, 'disc', { complete: 'on', D: '25', notes: 'DISC privado' });
    await save(a.id, 'opinion', { recommendation: 'Recomendação profissional', concerns: 'Ponto interno' });
    await expect(createShortlistShare(ctx, first.id, [a.id], [a.id])).rejects.toThrow('finalizados');
    await save(a.id, 'opinion', { recommendation: 'Recomendação profissional', concerns: 'Ponto interno', intent: 'finalize' });
    expect(await db.recruitingAssessment.findUnique({ where: { opportunityId: b.id } })).toBeNull();
    await expect(createShortlistShare(ctx, first.id, [a.id, b.id], [])).rejects.toThrow('indisponível');
    await expect(createShortlistShare({ ...ctx, accessRole: 'INTERVIEWER' }, first.id, [a.id], [])).rejects.toThrow('perfil');
    const plain = await createShortlistShare(ctx, first.id, [a.id], []);
    expect((await readShortlistShare((await resolveShare(plain.code))!))?.finalists[0].opinion).toBeNull();
    const selected = await createShortlistShare(ctx, first.id, [a.id], [a.id]);
    const payload = (await resolveShare(selected.code))!;
    const share = await readShortlistShare(payload);
    expect(share?.finalists[0].opinion?.recommendation).toBe('Recomendação profissional');
    expect(JSON.stringify(share)).not.toMatch(/privado@example|"D":|DISC privado|Ponto interno/);
    await save(a.id, 'opinion', { recommendation: 'Avaliação revisada', intent: 'finalize' });
    expect((await readShortlistShare(payload))?.finalists[0].opinion).toBeNull();
    await db.opportunity.update({ where: { id: a.id }, data: { confidential: true } });
    expect((await readShortlistShare(payload))?.finalists).toEqual([]);
    expect(await revokeRecruitingShares(ctx, 'shortlist', first.id)).toBe(2);
    expect(await resolveShare(selected.code)).toBeNull();
  });
});
