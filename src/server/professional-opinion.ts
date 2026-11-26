import { randomUUID } from 'node:crypto';
import { textRecord } from '@/lib/i18n/pt-BR/assessment';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { assistedFields, customerFeedbackLabels, opinionTemplate, opinionTemplates } from '@/lib/professional-opinion';
import { readText } from '@/lib/competency-assessment';
import { actorOf, emitEvent } from '@/server/events';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { finalistStage } from '@/server/operational-pipeline';
import { aiConfigured, runAiTask } from '@/server/ai-client';

export async function saveOpinionTemplate(ctx: SessionContext, form: FormData) {
  if (!isAdmin(ctx)) throw new Error('Somente administradores podem configurar modelos de parecer.');
  const id = readText(form, 'id', 100);
  const name = readText(form, 'name', 100);
  const mode = readText(form, 'mode', 12);
  await db.$transaction(async (tx) => {
    const [org] = await tx.$queryRaw<{ opinionTemplate: unknown }[]>`
      SELECT "opinionTemplate" FROM "Organization" WHERE id = ${ctx.orgId} FOR UPDATE
    `;
    if (!org) throw new Error('Organização indisponível.');
    const templates = opinionTemplates(org.opinionTemplate);
    const index = templates.findIndex((template) => template.id === id);
    if (id && index < 0) throw new Error('Modelo indisponível.');
    if (mode === 'toggle' && index >= 0) templates[index] = { ...templates[index], inactive: !templates[index].inactive };
    else {
      if (!name) throw new Error('Informe o nome do modelo.');
      const sections = opinionTemplate(form.getAll('section'));
      if (index < 0 || mode === 'duplicate') {
        if (templates.length >= 30) throw new Error('Limite de modelos atingido.');
        templates.push({ id: randomUUID(), name, sections, inactive: false });
      } else templates[index] = { ...templates[index], name, sections };
    }
    if (!templates.some((item) => !item.inactive)) throw new Error('Mantenha ao menos um modelo ativo.');
    await tx.organization.update({ where: { id: ctx.orgId }, data: { opinionTemplate: templates } });
  });
}

export async function saveCustomerFeedback(ctx: SessionContext, postingId: string, id: string, form: FormData) {
  requireRecruitingAccess(ctx);
  const status = readText(form, 'status', 25);
  const notes = readText(form, 'notes', 2000);
  if (!Object.hasOwn(customerFeedbackLabels, status)) throw new Error('Selecione uma situação de retorno.');
  await db.$transaction(async (tx) => {
    const row = await tx.opportunity.findFirst({
      where: { id, postingId, orgId: ctx.orgId, stage: finalistStage(ctx.orgId), posting: { orgId: ctx.orgId, clientCompany: { orgId: ctx.orgId } },
        contact: { orgId: ctx.orgId, isAnonymized: false } },
      select: { contactId: true, posting: { select: { clientCompanyId: true } } },
    });
    if (!row?.posting?.clientCompanyId || !await lockIdentifiableContact(tx, ctx.orgId, row.contactId)) throw new Error('Participação ou cliente indisponível.');
    const existing = await tx.recruitingAssessment.findUnique({ where: { opportunityId: id }, select: { clientFeedback: true } });
    const history = Array.isArray(existing?.clientFeedback) ? existing.clientFeedback : [];
    if (history.length >= 200) throw new Error('Limite de registros de retorno atingido.');
    const clientFeedback = [...history, { status, notes, by: ctx.userId, at: new Date().toISOString(), clientId: row.posting.clientCompanyId }];
    await tx.recruitingAssessment.upsert({ where: { opportunityId: id }, create: { opportunityId: id, clientFeedback }, update: { clientFeedback } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'assessment.client_feedback', subjectType: 'opportunity', subjectId: id });
  });
}

export async function assistOpinionSection(ctx: SessionContext, id: string, section: string, source: string, confirmed: boolean) {
  requireRecruitingAccess(ctx);
  if (!confirmed || !aiConfigured() || !assistedFields.some((field) => field === section) || !source.trim() || source.length > 4000) {
    throw new Error('A assistência está indisponível ou o trecho não foi autorizado.');
  }
  const saved = await db.opportunity.findFirst({ where: { id, orgId: ctx.orgId, confidential: false,
    contact: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false } },
    select: { recruitingAssessment: { select: { opinion: true } } } });
  const text = source.trim();
  const sectionText = textRecord(saved?.recruitingAssessment?.opinion)[section];
  if (!sectionText?.includes(text) || /[^\s@]+@[^\s@]+|(?:\+?55[ .-]?)?\(?\d{2}\)?[ .-]?\d{4,5}[- ]?\d{4}|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(text)) {
    throw new Error('Use um trecho já salvo e retire contatos ou documentos pessoais antes de solicitar assistência.');
  }
  const result = await runAiTask('opinion-draft', { section, source: text });
  if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 4000) {
    throw new Error('O fornecedor não retornou um trecho válido.');
  }
  return result.text;
}
