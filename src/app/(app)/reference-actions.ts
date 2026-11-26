'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma, ProfessionalReferenceStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { isAdmin, requireRecruitingAccess, requireSession } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { readReferenceAnswers, referenceChannels, referenceFields, referenceQuestions, referenceSources, referenceStatuses } from '@/lib/professional-references';

function field(form: FormData, key: string, max: number) {
  const value = String(form.get(key) ?? '').trim();
  if (value.length > max) throw new Error('O texto excede o limite permitido.');
  return value;
}

function referenceData(form: FormData) {
  const data = Object.fromEntries(Object.keys(referenceFields).map(key => [key,
    field(form, key, key === 'notes' ? 1000 : key === 'authorization' ? 500 : 160),
  ])) as Record<keyof typeof referenceFields, string>;
  if (!data.name || (data.channel && !referenceChannels.includes(data.channel))) throw new Error('Informe o nome e revise o canal.');
  if ((data.phone || data.email) && !data.authorization) throw new Error('Registre a autorização para guardar os contatos.');
  return data;
}

export async function saveReferenceQuestionnaire(form: FormData) {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) throw new Error('Acesso restrito à administração.');
  const questions = field(form, 'questions', 4000).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  if (!questions.length || questions.length > 25 || new Set(questions).size !== questions.length || questions.some(q => q.length > 160)) {
    throw new Error('Informe de 1 a 25 perguntas distintas, com até 160 caracteres cada.');
  }
  await db.$transaction(async tx => {
    await tx.organization.update({ where: { id: ctx.orgId }, data: { referenceQuestionnaire: questions } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'references.questionnaire_updated', subjectType: 'organization', subjectId: ctx.orgId });
  });
  revalidatePath('/settings/modelos-avaliacao');
}

export async function updateReferenceCheck(id: string, mode: string, form: FormData) {
  const ctx = await requireSession();
  requireRecruitingAccess(ctx);
  const userId = ctx.userId;
  if (!userId) throw new Error('Entre com uma conta de recrutamento.');
  await db.$transaction(async tx => {
    const opportunity = await tx.opportunity.findFirst({ where: { id, orgId: ctx.orgId }, select: { contactId: true } });
    if (!opportunity || !await lockIdentifiableContact(tx, ctx.orgId, opportunity.contactId)) throw new Error('Participação indisponível.');
    const check = await tx.referenceCheck.upsert({
      where: { opportunityId: id }, create: { opportunityId: id, updatedBy: userId }, update: { updatedBy: userId },
    });
    const hasVerification = async () => {
      const rows = await tx.professionalReference.findMany({ where: { opportunityId: id, revokedAt: null }, select: { answers: true } });
      return rows.some(row => readReferenceAnswers(row.answers).some(answer => answer.source === 'verified'));
    };
    let payload: Prisma.InputJsonObject = {};
    if (mode === 'status') {
      const status = field(form, 'status', 40) as ProfessionalReferenceStatus;
      if (!Object.hasOwn(referenceStatuses, status)) throw new Error('Situação inválida.');
      if (status === 'VERIFIED' && !await hasVerification()) throw new Error('Registre uma informação verificada no questionário.');
      await tx.referenceCheck.update({ where: { opportunityId: id }, data: { status } });
      payload = { from: check.status, to: status };
    } else if (mode === 'create') {
      const data = referenceData(form);
      const reference = await tx.professionalReference.create({ data: { ...data, opportunityId: id, registeredBy: userId } });
      payload = { referenceId: reference.id };
    } else {
      const referenceId = field(form, 'referenceId', 100);
      const reference = await tx.professionalReference.findFirst({ where: { id: referenceId, opportunityId: id } });
      if (!reference || reference.revokedAt) throw new Error('Referência indisponível.');
      payload = { referenceId };
      if (mode === 'edit') {
        const data = referenceData(form);
        if (reference.authorization && !data.authorization) throw new Error('Use Revogar para retirar a autorização.');
        await tx.professionalReference.update({ where: { id: referenceId }, data });
      } else if (mode === 'revoke') {
        await tx.professionalReference.update({ where: { id: referenceId }, data: {
          revokedAt: new Date(), name: '', company: '', role: '', relationship: '', period: '', phone: '', email: '', notes: '', channel: '', authorization: '', answers: [],
        } });
      } else if (mode === 'attempt') {
        const channel = field(form, 'channel', 40);
        const localDate = field(form, 'occurredAt', 16);
        const occurredAt = new Date(localDate + ':00-03:00');
        const validDate = Number.isFinite(+occurredAt) && new Date(+occurredAt - 3 * 3600_000).toISOString().slice(0, 16) === localDate;
        const result = field(form, 'result', 40);
        if (!reference.authorization || !referenceChannels.includes(channel) || !['Sem resposta', 'Resposta recebida', 'Retorno combinado', 'Contato indisponível'].includes(result) || !validDate || occurredAt > new Date()) {
          throw new Error('Confira a autorização, o canal, a data e o resultado do contato.');
        }
        await tx.referenceContactAttempt.create({ data: { referenceId, actorId: userId, channel, occurredAt, result } });
      } else if (mode === 'answers') {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { referenceQuestionnaire: true } });
        const questions = referenceQuestions(org.referenceQuestionnaire);
        if (form.get('questionnaire') !== JSON.stringify(questions)) throw new Error('O modelo mudou. Atualize a página.');
        const answers = questions.flatMap((question, index) => {
          const source = field(form, 'source_' + index, 40) as keyof typeof referenceSources;
          const text = field(form, 'answer_' + index, 800);
          if (!source && !text) return [];
          if (!Object.hasOwn(referenceSources, source) || (source === 'verified' && (!text || !reference.authorization))) {
            throw new Error('Informe a fonte e descreva o que foi confirmado.');
          }
          return [{ question, source, text }];
        });
        await tx.professionalReference.update({ where: { id: referenceId }, data: { answers: [...readReferenceAnswers(reference.answers).filter(answer => !questions.includes(answer.question)), ...answers] } });
      } else {
        throw new Error('Ação inválida.');
      }
    }
    if ((mode === 'revoke' || mode === 'answers') && check.status === 'VERIFIED' && !await hasVerification()) {
      await tx.referenceCheck.update({ where: { opportunityId: id }, data: { status: 'WAITING_INFORMATION' } });
      payload = { ...payload, from: check.status, to: 'WAITING_INFORMATION' };
    }
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'references.' + mode, subjectType: 'opportunity', subjectId: id, payload });
  });
  revalidatePath('/candidates/' + id);
  revalidatePath('/pipeline/operacao');
}
