import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { defaultScale, discScale, ratedAverage, readInterview, readTemplates } from '@/lib/competency-assessment';
import { createPosting } from '@/server/postings';
import { saveCompetencyInterview, saveCompetencyTemplate, savePostingCompetencies } from '@/server/competency-assessment';
import { saveRecruitingAssessment } from '@/server/recruiting-assessment';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};

it('omits unrated items and accepts the scale of the DISC instrument', () => {
  expect(ratedAverage([{ score: 4 }, { score: null }, { score: 2 }])).toBe(3);
  expect(ratedAverage([{ score: null }])).toBeNull();
  expect(discScale('-10', '10')?.parse('2,5')).toBe(2.5);
  expect(discScale('9', '1')).toBeNull();
});

describe.skipIf(!hasDb)('competências e DISC', () => {
  it('copies templates, scopes assessments to the application and keeps the original DISC', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const template = readTemplates(null)[0];
    const fields = { id: template.id, name: template.name, scale: defaultScale.join('\n'), questions: 'Comunicação\nOrganização' };
    await expect(saveCompetencyTemplate(ctx, form(fields))).rejects.toThrow('administradores');
    await saveCompetencyTemplate({ ...ctx, accessRole: 'ADMIN' }, form(fields));
    const vacancy = (title: string) => createPosting(ctx, { title, workplaceType: 'REMOTE', commitment: 'FULL_TIME' });
    const [first, second] = await Promise.all([vacancy('Vaga fictícia A'), vacancy('Vaga fictícia B')]);
    const contact = await db.contact.create({ data: { orgId: org.id, name: 'Candidato Fictício', emails: [], phones: [], tags: [] } });
    const application = (postingId: string) => db.opportunity.create({ data: { orgId: org.id, contactId: contact.id, postingId, stageId: stages[0].id, origin: 'SOURCED' } });
    const [a, b] = await Promise.all([application(first.id), application(second.id)]);
    await savePostingCompetencies(ctx, first.id, form(fields));
    await expect(saveCompetencyInterview({ ...ctx, accessRole: 'INTERVIEWER' }, a.id, form({}))).rejects.toThrow('perfil');
    await saveCompetencyInterview(ctx, a.id, form({ 'score-0': '4', 'evidence-0': 'Exemplo fictício' }));
    await savePostingCompetencies(ctx, first.id, form({ ...fields, questions: 'Outro roteiro' }));
    const assessment = await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: a.id } });
    const draft = readInterview(assessment.competencyInterview)!;
    expect(draft.questions).toEqual(['Comunicação', 'Organização']);
    expect(draft.answers.map((answer) => answer.score)).toEqual([4, null]);
    expect(draft.completed).toBe(false);
    await expect(saveCompetencyInterview(ctx, a.id, form({ completed: 'on' }))).rejects.toThrow('Atualize');
    await saveCompetencyInterview(ctx, a.id, form({ revision: draft.savedAt, 'score-0': '5', recommendation: 'YES', justification: 'Evidência fictícia', completed: 'on' }));
    await expect(saveRecruitingAssessment(ctx, a.id, 'disc', form({ scaleMin: '-5', scaleMax: '5', D: '9' }))).rejects.toThrow('escala');
    await saveRecruitingAssessment(ctx, a.id, 'disc', form({ scaleMin: '-5', scaleMax: '5', D: '-2,5', complete: 'on' }));
    await expect(saveRecruitingAssessment(ctx, b.id, 'disc', form({ reuseId: a.id }))).rejects.toThrow('autorização');
    await saveRecruitingAssessment(ctx, b.id, 'disc', form({ reuseId: a.id, reuseConfirmed: 'on', reusePurpose: 'Mesma função fictícia' }));
    const copied = await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: b.id } });
    expect(copied.competencyInterview).toBeNull();
    expect(copied.disc).toMatchObject({ D: '-2,5', sourceOpportunityId: a.id });
    expect((await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: a.id } })).disc).not.toHaveProperty('sourceOpportunityId');
  });
});
