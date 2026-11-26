import { queueTalentSummary } from './talent-summary';
import { db } from '@/lib/db';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';
import { availabilityLabels, careerFields, parseSalary, phoneDigits, statesBR } from '@/lib/talent-profile';
import { actorOf, emitEvent } from '@/server/events';
import { lockIdentifiableContact } from '@/server/contact-lock';
import { invalidateContactCounts, invalidatePipelineCounts } from '@/server/lists/cache';
import { storeExtractedResume, type ResumeUpload } from '@/server/resume-upload';
import { discardUnlinkedFile } from '@/server/storage';
import { textFields } from '@/server/text';

export class TalentProfileError extends Error {}

function readField(form: FormData, key: string, max: number) {
  const value = String(form.get(key) ?? '').trim();
  if (value.length > max) throw new TalentProfileError('Um dos campos excede o tamanho permitido.');
  return value;
}

export async function saveTalentProfile(ctx: SessionContext, id: string | null, form: FormData) {
  requireRecruitingAccess(ctx);
  const name = readField(form, 'name', 200);
  const headline = readField(form, 'headline', 250) || null;
  const location = readField(form, 'location', 180) || null;
  const email = readField(form, 'email', 254).toLowerCase();
  const phone = readField(form, 'phone', 36);
  const careerProfile = Object.fromEntries(Object.keys(careerFields).map((key) =>
    [key, readField(form, key, key === 'skills' || key === 'experience' ? 5000 : 180)]));
  if (!name) throw new TalentProfileError('Informe o nome completo.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TalentProfileError('Informe um e-mail válido.');
  if ([phone, careerProfile.whatsapp].some((value) => value && !/^[0-9+().\s-]{8,36}$/.test(value))) throw new TalentProfileError('Informe um número de telefone válido.');
  if (careerProfile.state && !statesBR.includes(careerProfile.state)) throw new TalentProfileError('Selecione uma UF válida.');
  if (careerProfile.availability && !Object.hasOwn(availabilityLabels, careerProfile.availability)) throw new TalentProfileError('Selecione uma disponibilidade válida.');
  let salaryExpectation;
  try { salaryExpectation = parseSalary(readField(form, 'salary', 20)); }
  catch (error) { throw new TalentProfileError(error instanceof Error ? error.message : 'Pretensão salarial inválida.'); }

  const saved = await db.$transaction(async (tx) => {
    const identities = [email && `apply:${ctx.orgId}:${email}`, phone && `talent-phone:${ctx.orgId}:${phoneDigits(phone)}`].filter(Boolean).sort();
    for (const identity of identities) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity}))`;
    const matched = await tx.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Contact" c WHERE c."orgId" = ${ctx.orgId} AND NOT c."isAnonymized" AND c.id <> ${id ?? ''}
        AND ((${email} <> '' AND EXISTS (SELECT 1 FROM unnest(c.emails) e WHERE lower(trim(e)) = ${email}))
          OR (${phoneDigits(phone)} <> '' AND EXISTS (SELECT 1 FROM unnest(c.phones) p
            WHERE regexp_replace(regexp_replace(p, '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ${phoneDigits(phone)})))
      LIMIT 2
    `;
    if (matched.length) throw new TalentProfileError('Já existe um contato com esse e-mail ou telefone. Localize o cadastro para revisar os dados.');
    const current = id && await lockIdentifiableContact(tx, ctx.orgId, id)
      ? await tx.contact.findUnique({ where: { id }, select: { emails: true, phones: true } }) : null;
    if (id && !current) throw new TalentProfileError('Cadastro indisponível.');
    const emails = [...new Set([email, ...(current?.emails.slice(1) ?? [])].filter(Boolean))];
    const phones = [...new Set([phone, ...(current?.phones.slice(1) ?? [])].filter(Boolean))];
    const data = { name, headline, location, careerProfile, salaryExpectation, emails, phones };
    const contact = id
      ? await tx.contact.update({ where: { id, orgId: ctx.orgId }, data })
      : await tx.contact.create({ data: { orgId: ctx.orgId, ...data } });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: id ? 'contact.updated' : 'contact.created',
      subjectType: 'contact', subjectId: contact.id,
    });
    if (process.env.RGA_SUMMARY_AUTO === 'true') await queueTalentSummary(tx, ctx.orgId, contact.id, 20);
    return contact;
  });
  invalidateContactCounts(ctx.orgId);
  return saved;
}

export async function attachTalentResume(ctx: SessionContext, contactId: string, upload: ResumeUpload) {
  requireRecruitingAccess(ctx);
  const contact = await db.contact.findFirst({ where: { orgId: ctx.orgId, id: contactId, isAnonymized: false }, select: { id: true } });
  if (!contact) throw new TalentProfileError('Cadastro indisponível.');
  const { file, extracted } = await storeExtractedResume(ctx.orgId, upload);
  try {
    await db.$transaction(async (tx) => {
      if (!await lockIdentifiableContact(tx, ctx.orgId, contactId)) throw new TalentProfileError('Cadastro indisponível.');
      await tx.storedFile.update({
        where: { id: file.id, deletePendingAt: { gt: new Date() } },
        data: { orgId: ctx.orgId, contactId, resumeVersion: true, uploadedById: ctx.userId,
          resumeContent: extracted.text, deletePendingAt: null, ...textFields(extracted, new Date()) },
      });
      await tx.contact.updateMany({
        where: { orgId: ctx.orgId, id: contactId, resumeFileId: null },
        data: { resumeFileId: file.id, resumeText: extracted.text },
      });
      await emitEvent(tx, {
        orgId: ctx.orgId, ...actorOf(ctx), verb: 'contact.resume_attached', subjectType: 'contact',
        subjectId: contactId, payload: { fileId: file.id },
      });
      if (process.env.RGA_SUMMARY_AUTO === 'true') await queueTalentSummary(tx, ctx.orgId, contactId, 50);
    });
  } catch (error) {
    await discardUnlinkedFile(ctx.orgId, file.id).catch(() => undefined);
    throw error;
  }
  invalidateContactCounts(ctx.orgId);
  return file.id;
}

export async function selectTalentResume(ctx: SessionContext, contactId: string, fileId: string, opportunityId?: string) {
  requireRecruitingAccess(ctx);
  await db.$transaction(async (tx) => {
    if (!await lockIdentifiableContact(tx, ctx.orgId, contactId)) throw new TalentProfileError('Cadastro indisponível.');
    const contact = await tx.contact.findUniqueOrThrow({ where: { id: contactId } });
    const file = await tx.storedFile.findFirst({
      where: { orgId: ctx.orgId, id: fileId, deletePendingAt: null, resumeVersion: true,
        OR: [{ contactId }, { id: contact.resumeFileId ?? '', contactId: null }] },
    });
    if (!file) throw new TalentProfileError('Currículo indisponível.');
    if (opportunityId) {
      const result = await tx.opportunity.updateMany({
        where: { orgId: ctx.orgId, contactId, id: opportunityId, status: 'ACTIVE' },
        data: { applicationResumeId: file.id },
      });
      if (!result.count) throw new TalentProfileError('Selecione uma participação ativa deste candidato.');
    } else {
      if (contact.resumeFileId && contact.resumeFileId !== file.id) {
        await tx.opportunity.updateMany({
          where: { orgId: ctx.orgId, contactId, applicationResumeId: null },
          data: { applicationResumeId: contact.resumeFileId },
        });
      }
      await tx.contact.update({ where: { id: contactId }, data: { resumeFileId: file.id, resumeText: file.resumeContent } });
      if (process.env.RGA_SUMMARY_AUTO === 'true') await queueTalentSummary(tx, ctx.orgId, contactId, 50);
    }
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'contact.resume_selected', subjectType: 'contact',
      subjectId: contactId, payload: { fileId: file.id, opportunityId: opportunityId ?? null },
    });
  });
  invalidateContactCounts(ctx.orgId);
  invalidatePipelineCounts(ctx.orgId);
}

/** The operator records a preference only after verifying the candidate's instructions. */
export async function recordTalentPreference(ctx: SessionContext, id: string, granted: boolean) {
  requireRecruitingAccess(ctx);
  await db.$transaction(async (tx) => {
    if (!await lockIdentifiableContact(tx, ctx.orgId, id)) throw new TalentProfileError('Cadastro indisponível.');
    const scope = { orgId: ctx.orgId, contactId: id, purpose: 'PROFILE_STORAGE' as const };
    const now = new Date();
    await tx.consentRecord.updateMany({ where: { ...scope, withdrawnAt: null }, data: { withdrawnAt: now } });
    await tx.consentRecord.create({ data: { ...scope, withdrawnAt: granted ? null : now } });
    if (!granted) {
      await tx.talentSummary.deleteMany({ where: { orgId: ctx.orgId, contactId: id } });
      await tx.talentCvText.deleteMany({ where: { orgId: ctx.orgId, contactId: id } });
    }
    else if (process.env.RGA_SUMMARY_AUTO === 'true') await queueTalentSummary(tx, ctx.orgId, id, 20);
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: granted ? 'consent.granted' : 'consent.withdrawn',
      subjectType: 'contact', subjectId: id, payload: { purpose: 'PROFILE_STORAGE', source: 'verified_by_staff' },
    });
  });
  invalidateContactCounts(ctx.orgId);
}
