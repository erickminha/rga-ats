import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { discAxes, opinionFields, screeningLabels } from '@/lib/i18n/pt-BR/assessment';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { actorOf, emitEvent } from '@/server/events';
import { discardUnlinkedFile, retryPendingFileDeletion, storeFile } from '@/server/storage';
import { MAX_RESUME_BYTES } from '@/server/resume';
import { sniffFormat } from '@/server/text';

export type AssessmentPart = 'screening' | 'disc' | 'opinion';

function read(form: FormData, key: string, max = 4000) {
  const value = String(form.get(key) ?? '').trim();
  if (value.length > max) throw new Error('Um dos campos excede o limite permitido.');
  return value;
}

export async function saveRecruitingAssessment(ctx: SessionContext, opportunityId: string, part: AssessmentPart, form: FormData) {
  requireRecruitingAccess(ctx);
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, orgId: ctx.orgId, contact: { orgId: ctx.orgId, isAnonymized: false } },
    select: { contactId: true },
  });
  if (!opportunity) throw new Error('Participação indisponível.');
  const result = part === 'screening' ? read(form, 'result') : null;
  if (result !== null && result !== '' && !Object.hasOwn(screeningLabels, result)) throw new Error('Resultado de triagem inválido.');
  const screening = part === 'screening' ? { result: result ?? '', notes: read(form, 'notes') } : undefined;
  const disc = part === 'disc' ? {
    complete: form.get('complete') === 'on', result: read(form, 'result', 500), notes: read(form, 'notes'),
    ...Object.fromEntries(discAxes.map((axis) => [axis, read(form, axis, 40)])),
  } : undefined;
  const opinion = part === 'opinion' ? Object.fromEntries(Object.keys(opinionFields).map((key) => [key, read(form, key)])) : undefined;
  const finalize = part === 'opinion' && form.get('intent') === 'finalize';
  if (finalize && !opinion?.recommendation) throw new Error('Informe a recomendação para finalizar o parecer.');
  if (!screening && !disc && !opinion) throw new Error('Registro inválido.');

  const upload = part === 'disc' ? form.get('report') : null;
  let file: Awaited<ReturnType<typeof storeFile>> | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_RESUME_BYTES) throw new Error('O relatório deve ter até 5 MB.');
    const data = Buffer.from(await upload.arrayBuffer());
    if (sniffFormat(data).format !== 'pdf') throw new Error('Envie o relatório DISC em PDF.');
    file = await storeFile({ orgId: ctx.orgId, filename: 'relatorio-disc.pdf', mime: 'application/pdf', data }, { staged: true });
  }

  try {
    await db.$transaction(async (tx) => {
      if (!await lockIdentifiableContact(tx, ctx.orgId, opportunity.contactId)) throw new Error('Participação indisponível.');
      const current = await tx.recruitingAssessment.findUnique({ where: { opportunityId } });
      const replace = part === 'disc' && (file || form.get('removeReport') === 'on');
      if (file) await tx.storedFile.update({
        where: { id: file.id, orgId: ctx.orgId, deletePendingAt: { gt: new Date() } },
        data: { deletePendingAt: null, contactId: opportunity.contactId },
      });
      const data = {
        screening, disc, opinion,
        ...(replace ? { discFileId: file?.id ?? null } : {}),
        ...(opinion ? { opinionAuthorId: ctx.userId, opinionFinalizedAt: finalize ? new Date() : null } : {}),
      };
      await tx.recruitingAssessment.upsert({ where: { opportunityId }, create: { opportunityId, ...data }, update: data });
      if (replace && current?.discFileId) await tx.storedFile.updateMany({
        where: { id: current.discFileId, orgId: ctx.orgId },
        data: { deletePendingAt: new Date() },
      });
      await emitEvent(tx, {
        orgId: ctx.orgId, ...actorOf(ctx),
        verb: finalize ? 'assessment.opinion_finalized' : `assessment.${part}_updated`,
        subjectType: 'opportunity', subjectId: opportunityId,
      });
    });
  } catch (error) {
    if (file) await discardUnlinkedFile(ctx.orgId, file.id).catch(() => undefined);
    throw error;
  }
  if (part === 'disc') await retryPendingFileDeletion(ctx.orgId).catch(() => undefined);
}
