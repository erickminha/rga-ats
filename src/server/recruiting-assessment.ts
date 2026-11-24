import { discDetails, discScale } from '@/lib/competency-assessment';
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
    select: { contactId: true, postingId: true },
  });
  if (!opportunity) throw new Error('Participação indisponível.');
  const result = part === 'screening' ? read(form, 'result') : null;
  if (result !== null && result !== '' && !Object.hasOwn(screeningLabels, result)) throw new Error('Resultado de triagem inválido.');
  const screening = part === 'screening' ? { result: result ?? '', notes: read(form, 'notes') } : undefined;
  const disc = part === 'disc' ? {
    ...Object.fromEntries(Object.keys(discDetails).map((key) => [key, read(form, key)])),
    scaleMin: read(form, 'scaleMin', 20), scaleMax: read(form, 'scaleMax', 20), scaleName: read(form, 'scaleName', 100),
    complete: form.get('complete') === 'on', result: read(form, 'result', 500), notes: read(form, 'notes'),
    ...Object.fromEntries(discAxes.map((axis) => [axis, read(form, axis, 40)])),
  } : undefined;
  if (disc) {
    const date = (disc as Record<string, unknown>).date;
    if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      throw new Error('Informe uma data válida para o DISC.');
    }
    const scale = discScale(disc.scaleMin, disc.scaleMax);
    if ((disc.scaleMin || disc.scaleMax) && !scale) throw new Error('Informe uma escala DISC válida.');
    for (const axis of discAxes) {
      const value = (disc as Record<string, unknown>)[axis];
      if (scale && typeof value === 'string' && value && !(scale.parse(value) >= scale.min && scale.parse(value) <= scale.max)) {
        throw new Error('Confira se os resultados estão dentro da escala DISC informada.');
      }
    }
  }
  const opinion = part === 'opinion' ? Object.fromEntries(Object.keys(opinionFields).map((key) => [key, read(form, key)])) : undefined;
  const finalize = part === 'opinion' && form.get('intent') === 'finalize';
  if (finalize && !opinion?.recommendation) throw new Error('Informe a recomendação para finalizar o parecer.');
  if (!screening && !disc && !opinion) throw new Error('Registro inválido.');

  const reuseId = part === 'disc' ? read(form, 'reuseId', 100) : '';
  if (reuseId && (!opportunity.postingId || form.get('reuseConfirmed') !== 'on' || !read(form, 'reusePurpose', 500))) {
    throw new Error('Confirme a autorização, a validade e a finalidade do reaproveitamento.');
  }
  const upload = part === 'disc' ? form.get('report') : null;
  if (reuseId && ((upload instanceof File && upload.size) || form.get('removeReport') === 'on')) {
    throw new Error('Salve o reaproveitamento e o relatório em ações separadas.');
  }
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
      const reused = reuseId && await tx.recruitingAssessment.findFirst({
        where: { opportunityId: reuseId, opportunity: { id: { not: opportunityId }, orgId: ctx.orgId,
          contactId: opportunity.contactId, posting: { orgId: ctx.orgId }, contact: { retentionHold: false, isAnonymized: false },
          confidential: false } },
      });
      const sourceDisc = reused && reused.disc && typeof reused.disc === 'object' && !Array.isArray(reused.disc) ? reused.disc : null;
      if (reuseId && (!sourceDisc || sourceDisc.complete !== true)) throw new Error('Avaliação anterior indisponível.');
      const current = await tx.recruitingAssessment.findUnique({ where: { opportunityId } });
      if (reuseId && current?.discFileId) throw new Error('Remova o relatório atual antes de reaproveitar outra avaliação.');
      const previousDisc = current?.disc && typeof current.disc === 'object' && !Array.isArray(current.disc) ? current.disc : null;
      const discOrigin = previousDisc?.sourceOpportunityId ? {
        sourceOpportunityId: previousDisc.sourceOpportunityId, reusedAt: previousDisc.reusedAt ?? null,
        reusedById: previousDisc.reusedById ?? null, reusePurpose: previousDisc.reusePurpose ?? null,
      } : {};
      const replace = part === 'disc' && (file || form.get('removeReport') === 'on');
      if (file) await tx.storedFile.update({
        where: { id: file.id, orgId: ctx.orgId, deletePendingAt: { gt: new Date() } },
        data: { deletePendingAt: null, contactId: opportunity.contactId },
      });
      const data = {
        screening,
        disc: sourceDisc ? { ...sourceDisc, sourceOpportunityId: reuseId, reusedAt: new Date().toISOString(), reusedById: ctx.userId,
          reusePurpose: read(form, 'reusePurpose', 500) } : disc && { ...disc, ...discOrigin },
        opinion,
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
        ...(reuseId ? { payload: { sourceOpportunityId: reuseId } } : {}),
      });
    });
  } catch (error) {
    if (file) await discardUnlinkedFile(ctx.orgId, file.id).catch(() => undefined);
    throw error;
  }
  if (part === 'disc') await retryPendingFileDeletion(ctx.orgId).catch(() => undefined);
}
