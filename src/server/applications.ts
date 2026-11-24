import { reserveRequest } from '@/server/request-limit';
import { discardUnlinkedFile } from '@/server/storage';
import { EEOEnabled, talentNetworkAllowed } from '@/server/privacy-options';
import { db } from '@/lib/db';
import { EEO_QUESTIONS } from '@/lib/i18n/pt-BR/candidate';
import { capName } from '@/lib/utils';
import { emitEvent } from '@/server/events';
import { DEFAULT_TEMPLATES, sendEmail } from '@/server/email';
import { storeExtractedResume, type ResumeUpload } from '@/server/resume-upload';
import { extractSignals, uniqueLinks } from '@/server/resume';
import { parseQueueFields } from '@/server/resume-parse';
import { textFields, type ExtractResult } from '@/server/text';
import { invalidateContactCounts, invalidatePipelineCounts } from '@/server/lists/cache';

export type ApplicationInput = {
  orgSlug: string;
  postingSlug: string;
  name: string;
  email: string;
  location?: string;
  linkedin?: string;
  coverNote?: string;
  networkOptIn?: boolean;
  storeProfile?: boolean;
  /** No MIME: the type is read from the bytes, never taken from the browser. */
  resume?: ResumeUpload;
  /** Campaign attribution captured from the careers-page URL. */
  utm?: { source?: string; medium?: string; campaign?: string };
  /** Voluntary EEO self-ID — stored with NO candidate linkage (aggregate only). */
  eeo?: { gender?: string; race?: string; veteran?: string; disability?: string };
};

function validate(input: ApplicationInput) {
  const email = input.email.toLowerCase().trim();
  if (!input.name.trim() || input.name.length > 200 || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Dados da candidatura inválidos.');
  }
  if ([input.orgSlug, input.postingSlug].some((slug) => !slug || slug.length > 150)
    || (input.location?.length ?? 0) > 200 || (input.coverNote?.length ?? 0) > 10_000
    || Object.values(input.utm ?? {}).some((value) => (value?.length ?? 0) > 200)) {
    throw new Error('A candidatura excede os limites dos campos.');
  }
  if (input.linkedin) {
    let url: URL | null = null;
    if (input.linkedin.length <= 500) {
      try { url = new URL(input.linkedin); } catch { /* Rejected below. */ }
    }
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Endereço de perfil inválido.');
    }
  }
  return email;
}

/** An application may carry its own resume. It never replaces a preexisting profile. */
export async function submitApplication(input: ApplicationInput) {
  const email = validate(input);
  const org = await db.organization.findUnique({ where: { slug: input.orgSlug } });
  if (!org) throw new Error('Organization not found');

  const posting = await db.posting.findFirst({
    where: { orgId: org.id, slug: input.postingSlug, state: 'PUBLISHED' },
  });
  if (!posting) throw new Error('Posting not found');

  const stage =
    (await db.stage.findFirst({
      where: { orgId: org.id, type: 'APPLICANT' },
      orderBy: { order: 'asc' },
    })) ??
    (await db.stage.findFirst({ where: { orgId: org.id }, orderBy: { order: 'asc' } }));
  if (!stage) throw new Error('Organization has no pipeline stages');

  if (!await reserveRequest('public-application', [org.id, email], 12, 60 * 60_000)) {
    throw new Error('Limite de candidaturas atingido. Tente novamente mais tarde.');
  }
  const links = input.linkedin?.trim() ? [input.linkedin.trim()] : [];

  // Read + store the resume before the transaction (slow I/O stays outside).
  // Extraction never throws: a file it can't read still makes an application,
  // and the resume-text cron retries what failed. One that needs a password
  // is turned away before it is stored: recruiters couldn't open it either.
  let resume: { fileId: string; extracted: ExtractResult } | null = null;
  let signals: { links: string[]; phones: string[] } | null = null;
  if (input.resume) {
    const { file, extracted } = await storeExtractedResume(org.id, input.resume);
    resume = { fileId: file.id, extracted };
    if (extracted.text) {
      signals = extractSignals(extracted.text, extracted.links, { targetsInText: extracted.format !== 'pdf' });
    }
  }
  const resumeFileId = resume?.fileId ?? null;
  const resumeText = resume?.extracted.text ?? null;

  const opportunity = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apply:${org.id}:${email}`}))`;
    const target = await tx.posting.findFirst({ where: { id: posting.id, orgId: org.id, state: 'PUBLISHED' }, select: { id: true } });
    if (!target) throw new Error('Vaga indisponível.');

    // The contact lock serializes with retention. Read the row again after acquiring it.
    const [matched] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Contact"
      WHERE "orgId" = ${org.id} AND NOT "isAnonymized" AND emails @> ARRAY[${email}]::text[]
      ORDER BY "createdAt", id LIMIT 1 FOR NO KEY UPDATE
    `;
    let contact = matched ? await tx.contact.findUnique({ where: { id: matched.id, isAnonymized: false } }) : null;
    const newContact = !contact;
    if (contact) {
      const previous = await tx.opportunity.findFirst({
        where: { orgId: org.id, postingId: posting.id, contactId: contact.id, origin: 'APPLIED',
          createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
      });
      if (previous) return { ...previous, contactName: contact.name, repeated: true };
    }
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          orgId: org.id,
          name: capName(input.name.trim()),
          location: input.location?.trim() || null,
          // Only the typed address: emails are the key for dedupe and the
          // status portal, and a resume lists other people's (references).
          emails: [email],
          links: uniqueLinks([...links, ...(signals?.links ?? [])]),
          phones: signals?.phones ?? [],
          resumeFileId,
          resumeText,
        },
      });
      await emitEvent(tx, {
        orgId: org.id,
        actorType: 'candidate',
        verb: 'contact.created',
        subjectType: 'contact',
        subjectId: contact.id,
        payload: { name: contact.name },
      });
    }

    const opportunity = await tx.opportunity.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        postingId: posting.id,
        stageId: stage.id,
        origin: 'APPLIED',
        applicationResumeId: resumeFileId,
        source: input.utm?.source?.trim() || 'careers site',
        customFields: {
          ...(input.coverNote?.trim() ? { coverNote: input.coverNote.trim() } : {}),
          ...(input.utm && (input.utm.source || input.utm.medium || input.utm.campaign)
            ? { utm: { source: input.utm.source, medium: input.utm.medium, campaign: input.utm.campaign } }
            : {}),
        },
      },
    });
    await tx.stageTransition.create({
      data: { opportunityId: opportunity.id, toStageId: stage.id },
    });
    // Consent to process the application itself (GDPR basis, auditable)
    await tx.consentRecord.create({
      data: { orgId: org.id, contactId: contact.id, purpose: 'APPLICATION' },
    });
    // Preferences from the public form may initialize a new profile. Existing
    // preferences can only be changed in an authenticated or verified flow.
    if (newContact && input.networkOptIn && org.talentNetworkEnabled && talentNetworkAllowed()) {
      await tx.consentRecord.create({
        data: { orgId: org.id, contactId: contact.id, purpose: 'NETWORK_DISCOVERY' },
      });
    }
    if (newContact && input.storeProfile !== undefined) {
      await tx.consentRecord.create({
        data: { orgId: org.id, contactId: contact.id, purpose: 'PROFILE_STORAGE', withdrawnAt: input.storeProfile ? null : new Date() },
      });
    }

    await emitEvent(tx, {
      orgId: org.id,
      actorType: 'candidate',
      verb: 'application.received',
      subjectType: 'opportunity',
      subjectId: opportunity.id,
      payload: { contactName: contact.name, postingTitle: posting.title, stageName: stage.name },
    });
    if (resume) {
      await tx.storedFile.update({
        where: { id: resume.fileId, deletePendingAt: { gt: new Date() } },
        data: {
          contactId: contact.id, deletePendingAt: null,
          ...textFields(resume.extracted, new Date()),
          ...(newContact ? parseQueueFields(resume.extracted.status, org) : {}),
        },
      });
    }
    return { ...opportunity, contactName: contact.name, repeated: false };
  }).catch(async (error) => {
    if (resume) await discardUnlinkedFile(org.id, resume.fileId).catch(() => undefined);
    throw error;
  });
  if (opportunity.repeated) {
    if (resume) await discardUnlinkedFile(org.id, resume.fileId).catch(() => undefined);
    return opportunity;
  }
  invalidatePipelineCounts(org.id);
  invalidateContactCounts(org.id);

  // EEO self-ID: written OUTSIDE the application transaction and without any
  // contact/opportunity id — the segregation is structural, not access-based.
  if (EEOEnabled() && org.collectEeo && input.eeo) {
    const [gender, race, veteran, disability] = EEO_QUESTIONS.map(({ name, options }) => {
      const key = name.slice(4) as keyof NonNullable<ApplicationInput['eeo']>;
      const value = input.eeo?.[key];
      return value && Object.hasOwn(options, value) ? value : 'declined';
    });
    await db.eeoResponse.create({
      data: {
        orgId: org.id,
        postingId: posting.id,
        gender, race, veteran, disability,
      },
    }).catch(() => console.warn('[application] EEO_WRITE_FAILED'));
  }

  // Automated confirmation email (org setting; template seeded at signup)
  if (org.autoConfirmTemplateId) {
    const template = await db.emailTemplate.findFirst({
      where: { id: org.autoConfirmTemplateId, orgId: org.id },
    });
    if (template) {
      const original = DEFAULT_TEMPLATES[0];
      const welcome = template.subject === original.subject && template.body === original.body
        ? {
            subject: 'Recebemos sua candidatura para {{job_title}}',
            body: 'Olá, {{first_name}}!\n\nRecebemos sua candidatura para {{job_title}}. A equipe de {{company_name}} vai analisar seu perfil e poderá entrar em contato sobre as próximas etapas.\n\nEquipe de recrutamento de {{company_name}}',
          }
        : template;
      await sendEmail({
        orgId: org.id,
        contactId: opportunity.contactId,
        opportunityId: opportunity.id,
        templateId: template.id,
        toEmail: email,
        subject: welcome.subject,
        body: welcome.body,
        vars: {
          candidate_name: opportunity.contactName,
          first_name: opportunity.contactName.split(' ')[0] ?? opportunity.contactName,
          job_title: posting.title,
          company_name: org.name,
        },
      }).catch(() => console.warn('[application] CONFIRMATION_FAILED'));
    }
  }

  return opportunity;
}
