import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { requireSession, type SessionContext } from '@/lib/session';
import { saveReferenceQuestionnaire, updateReferenceCheck } from '@/app/(app)/reference-actions';
import { defaultReferenceQuestions, readReferenceAnswers, referenceOpinionLine } from '@/lib/professional-references';
import { messageFor } from '@/lib/rga-productivity';
import { operationalConditions, operationalDate } from '@/server/operational-pipeline';
import { saveRecruitingAssessment } from '@/server/recruiting-assessment';
import { safeOpinion } from '@/server/share-links';
import { createCandidate, moveStage } from '@/server/opportunities';
import { createPosting } from '@/server/postings';
import { setPostingStageExclusions, setStageAvailability, setStageOrder } from '@/server/stages';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

vi.mock('@/lib/session', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/session')>(),
  requireSession: vi.fn(),
}));
vi.mock('next/cache', async importOriginal => ({
  ...await importOriginal<typeof import('next/cache')>(),
  revalidatePath: vi.fn(),
}));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

it('formats the operational date window in Brasília and omits contact details from opinion excerpts', () => {
  expect(operationalDate('2026-02-30')).toBeUndefined();
  expect(operationalDate('2026-11-26')?.toISOString()).toBe('2026-11-26T03:00:00.000Z');
  expect(operationalDate('2026-11-26', true)?.toISOString()).toBe('2026-11-27T03:00:00.000Z');
  const excerpt = referenceOpinionLine({
    question: 'Experiência', source: 'verified', text: 'Pessoa Fictícia confirmou a função. (11) 98765-4321 ou referencia@example.invalid.',
  }, ['Pessoa Fictícia']);
  expect(excerpt).toContain('Efetivamente verificada');
  expect(excerpt).not.toMatch(/Pessoa Fictícia|98765|example/);
  expect(safeOpinion({ references: excerpt })).not.toHaveProperty('references');
  const input = { name: 'Pessoa Fictícia', job: 'Vaga fictícia', brand: 'RGA' };
  expect(messageFor('reference', input)).toContain('Confirme previamente');
  expect(messageFor('referenceIntro', input)).toContain('disponibilidade');
  expect(messageFor('referenceReminder', input)).toContain('Retomamos');
  expect(messageFor('referenceThanks', input)).toContain('Agradecemos');
});

describe.skipIf(!hasDb)('Ciclo 5C.3', () => {
  it('preserves existing opportunities and transitions when disabling stages and correcting a hire', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'ADMIN' };
    const recruiter = { ...ctx, accessRole: 'TEAM_MEMBER' };
    const posting = await createPosting(ctx, { title: 'Vaga fictícia', workplaceType: 'REMOTE', commitment: 'FULL_TIME' });
    const applicant = stages.find(stage => stage.type === 'APPLICANT')!;
    const screen = stages.find(stage => stage.type === 'SCREEN')!;
    const interview = stages.find(stage => stage.type === 'ONSITE')!;
    const hired = stages.find(stage => stage.type === 'HIRED')!;
    const opportunity = await createCandidate(ctx, { name: 'Pessoa fictícia', postingId: posting.id, stageId: applicant.id, origin: 'APPLIED' });
    await saveRecruitingAssessment(recruiter, opportunity.id, 'screening', form({ result: 'REVIEW', notes: 'Triagem fictícia' }));
    await moveStage(ctx, opportunity.id, screen.id, { note: 'Triagem manual' });
    await expect(setPostingStageExclusions(recruiter, posting.id, [screen.id])).rejects.toThrow();
    await setPostingStageExclusions(ctx, posting.id, [screen.id]);
    const order = [applicant.id, interview.id, screen.id, hired.id];
    await setStageOrder(ctx, order);
    expect((await db.stage.findMany({ where: { orgId: org.id }, orderBy: { order: 'asc' } })).map(stage => stage.id)).toEqual(order);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).stageId).toBe(screen.id);
    await moveStage(ctx, opportunity.id, applicant.id, { note: 'Correção da etapa' });
    await expect(moveStage(ctx, opportunity.id, screen.id)).rejects.toThrow();
    await setPostingStageExclusions(ctx, posting.id, []);
    await setStageAvailability(ctx, screen.id, false);
    await expect(moveStage(ctx, opportunity.id, screen.id)).rejects.toThrow();
    await setStageAvailability(ctx, screen.id, true);
    await moveStage(ctx, opportunity.id, hired.id, { hireDate: '2026-01-01' });
    await expect(moveStage(recruiter, opportunity.id, screen.id, { correctHire: true, note: 'Registro fictício' })).rejects.toThrow();
    expect(await moveStage(ctx, opportunity.id, screen.id, { correctHire: true, note: 'Registro fictício' })).toMatchObject({ status: 'ACTIVE', hiredAt: null });
    expect(await db.stageTransition.count({ where: { opportunityId: opportunity.id, actorId: admin.id } })).toBe(5);
    expect(await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: opportunity.id } }))
      .toMatchObject({ screening: { result: 'REVIEW', notes: 'Triagem fictícia' } });
  });

  it('scopes references to the organization and preserves versioned, selected excerpts after revocation', async () => {
    const { org, admin, stages } = await createOrg();
    const foreign = await createOrg();
    const ctx: SessionContext = { orgId: org.id, userId: admin.id, accessRole: 'ADMIN' };
    vi.mocked(requireSession).mockImplementation(async () => ctx);
    const opportunity = await createCandidate(ctx, { name: 'Candidato fictício', stageId: stages[0].id, origin: 'SOURCED' });
    const update = (mode: string, data: Record<string, string>) => updateReferenceCheck(opportunity.id, mode, form(data));
    ctx.accessRole = 'TEAM_MEMBER';
    await expect(saveReferenceQuestionnaire(form({ questions: 'Vínculo' }))).rejects.toThrow();
    ctx.accessRole = 'ADMIN';
    await saveReferenceQuestionnaire(form({ questions: 'Vínculo' }));
    expect(defaultReferenceQuestions).toContain('Pontualidade');
    ctx.accessRole = 'TEAM_MEMBER';
    await update('status', { status: 'REQUESTED' });
    const conditions = operationalConditions(org.id, new Date(), [], [], []);
    expect(await db.opportunity.count({ where: { id: opportunity.id, AND: [conditions.references] } })).toBe(1);
    await expect(update('create', { name: 'Referência fictícia', email: 'contato@example.invalid' })).rejects.toThrow('autorização');
    await update('create', { name: 'Referência fictícia', email: 'contato@example.invalid', authorization: 'Contato autorizado para esta seleção' });
    const row = await db.professionalReference.findFirstOrThrow({ where: { opportunityId: opportunity.id } });
    const attempt = { referenceId: row.id, occurredAt: '2026-01-01T12:00', channel: 'E-mail', result: 'Resposta recebida' };
    await update('attempt', attempt);
    await update('answers', { referenceId: row.id, questionnaire: '["Vínculo"]', source_0: 'verified', answer_0: 'Vínculo confirmado' });
    await update('status', { status: 'VERIFIED' });
    expect(await db.opportunity.count({ where: { id: opportunity.id, AND: [conditions.references] } })).toBe(0);
    const saved = await db.professionalReference.findUniqueOrThrow({ where: { id: row.id }, include: { attempts: true } });
    expect(saved.attempts[0].occurredAt.toISOString()).toBe('2026-01-01T15:00:00.000Z');
    const excerpt = referenceOpinionLine(readReferenceAnswers(saved.answers)[0], [saved.email]);
    await saveRecruitingAssessment(ctx, opportunity.id, 'opinion', form({ references: excerpt, recommendation: 'Revisão fictícia', intent: 'finalize' }));
    ctx.orgId = foreign.org.id;
    await expect(update('revoke', { referenceId: row.id })).rejects.toThrow();
    ctx.orgId = org.id;
    ctx.accessRole = 'INTERVIEWER';
    await expect(update('revoke', { referenceId: row.id })).rejects.toThrow(/perfil/);
    ctx.accessRole = 'TEAM_MEMBER';
    await update('revoke', { referenceId: row.id });
    expect(await db.opportunity.count({ where: { id: opportunity.id, AND: [conditions.references] } })).toBe(1);
    await expect(update('attempt', attempt)).rejects.toThrow();
    expect(await db.professionalReference.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ email: '', name: '', answers: [] });
    expect(await db.professionalOpinionVersion.findFirstOrThrow({ where: { opportunityId: opportunity.id } })).toMatchObject({ content: { references: excerpt } });
    const events = await db.event.findMany({ where: { orgId: org.id, subjectId: opportunity.id, verb: { startsWith: 'references.' } } });
    expect(JSON.stringify(events)).not.toMatch(/contato@example|Referência fictícia|Vínculo confirmado/);
  });
});
