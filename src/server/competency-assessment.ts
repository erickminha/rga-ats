import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { planFromForm, postingRequirements, readInterview, readPlan, readTemplates, readText, recommendationLabels, requirementLabels } from '@/lib/competency-assessment';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';

export async function saveCompetencyTemplate(ctx: SessionContext, form: FormData) {
  if (!isAdmin(ctx)) throw new Error('Somente administradores podem editar os modelos.');
  const id = readText(form, 'id', 100);
  const name = readText(form, 'name', 100);
  const mode = readText(form, 'mode', 10);
  await db.$transaction(async (tx) => {
    const [org] = await tx.$queryRaw<{ assessmentTemplates: unknown }[]>`
      SELECT "assessmentTemplates" FROM "Organization" WHERE id = ${ctx.orgId} FOR UPDATE
    `;
    if (!org) throw new Error('Organização indisponível.');
    const templates = [...readTemplates(org.assessmentTemplates)];
    const index = templates.findIndex((item) => item.id === id);
    if (id && index < 0) throw new Error('Modelo indisponível.');
    if (mode === 'toggle' && index >= 0) templates[index] = { ...templates[index], inactive: !templates[index].inactive };
    else {
      if (!name) throw new Error('Informe o nome do modelo.');
      const plan = planFromForm(form);
      if (index < 0 || mode === 'duplicate') {
        if (templates.length >= 50) throw new Error('Limite de modelos atingido.');
        templates.push({ ...plan, id: randomUUID(), name, inactive: false });
      } else templates[index] = { ...templates[index], ...plan, name };
    }
    await tx.organization.update({ where: { id: ctx.orgId }, data: { assessmentTemplates: templates } });
  });
}

export async function savePostingCompetencies(ctx: SessionContext, postingId: string, form: FormData) {
  requireRecruitingAccess(ctx);
  const result = await db.posting.updateMany({
    where: { id: postingId, orgId: ctx.orgId }, data: { competencyPlan: planFromForm(form) },
  });
  if (!result.count) throw new Error('Vaga indisponível.');
}

export async function saveCompetencyInterview(ctx: SessionContext, opportunityId: string, form: FormData) {
  requireRecruitingAccess(ctx);
  await db.$transaction(async (tx) => {
    const row = await tx.opportunity.findFirst({
      where: { id: opportunityId, orgId: ctx.orgId, contact: { orgId: ctx.orgId, isAnonymized: false } },
      select: { contactId: true },
    });
    if (!row || !await lockIdentifiableContact(tx, ctx.orgId, row.contactId)) throw new Error('Participação indisponível.');
    const entry = await tx.opportunity.findFirstOrThrow({
      where: { id: opportunityId, orgId: ctx.orgId, contactId: row.contactId },
      select: { posting: { select: { orgId: true, competencyPlan: true, matchCriteria: true, content: true } },
        recruitingAssessment: { select: { competencyInterview: true } } },
    });
    const posting = entry.posting?.orgId === ctx.orgId ? entry.posting : null;
    const previous = readInterview(entry.recruitingAssessment?.competencyInterview);
    if (readText(form, 'revision', 50) !== (previous?.savedAt ?? '')) throw new Error('Atualize a página antes de editar este registro.');
    const plan = previous ? { questions: previous.questions, scale: previous.scale } : readPlan(posting?.competencyPlan);
    const questions = plan?.questions ?? [];
    const scale = plan?.scale ?? [];
    const answers = questions.map((_, i) => {
      const rating = readText(form, 'score-' + i, 2);
      const score = rating ? Number(rating) : null;
      if (score !== null && (!Number.isInteger(score) || score < 1 || score > scale.length)) throw new Error('Nota inválida.');
      return { score, response: readText(form, 'response-' + i, 1500), evidence: readText(form, 'evidence-' + i, 1500) };
    });
    const requirements = (previous?.requirements ?? postingRequirements(posting?.matchCriteria, posting?.content)).map(({ label }, i) => {
      const result = readText(form, 'requirement-' + i, 20) || 'UNVERIFIED';
      if (!Object.hasOwn(requirementLabels, result)) throw new Error('Classificação de requisito inválida.');
      return { label, result };
    });
    const recommendation = readText(form, 'recommendation', 25);
    const justification = readText(form, 'justification', 2500);
    if (recommendation && (!Object.hasOwn(recommendationLabels, recommendation) || !justification)) {
      throw new Error('Informe uma justificativa profissional para a recomendação.');
    }
    const completed = form.get('completed') === 'on';
    if (completed && !recommendation) throw new Error('Informe a recomendação antes de concluir.');
    const competencyInterview = { questions, scale, answers, requirements, recommendation, justification, completed,
      reviewerId: ctx.userId, savedAt: new Date().toISOString() };
    await tx.recruitingAssessment.upsert({ where: { opportunityId }, create: { opportunityId, competencyInterview }, update: { competencyInterview } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'assessment.competency_saved', subjectType: 'opportunity', subjectId: opportunityId });
  });
}
