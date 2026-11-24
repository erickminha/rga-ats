import { db } from '@/lib/db';
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

/**
 * Public apply flow — no session. The applicant lands in the org's first
 * applicant-type stage (falling back to the earliest stage). Contacts are
 * deduped by email; re-applications open a new opportunity on the same
 * contact (Lever model). Throws EncryptedDocumentError for a resume that
 * needs a password to open.
 */
export async function submitApplication(input: ApplicationInput) {
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

  const email = input.email.toLowerCase().trim();
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
    let contact = await tx.contact.findFirst({
      where: { orgId: org.id, emails: { has: email } },
    });
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
    if (input.networkOptIn && org.talentNetworkEnabled) {
      const existing = await tx.consentRecord.findFirst({
        where: {
          orgId: org.id,
          contactId: contact.id,
          purpose: 'NETWORK_DISCOVERY',
          withdrawnAt: null,
        },
      });
      if (!existing) {
        await tx.consentRecord.create({
          data: { orgId: org.id, contactId: contact.id, purpose: 'NETWORK_DISCOVERY' },
        });
        await emitEvent(tx, {
          orgId: org.id,
          actorType: 'candidate',
          verb: 'consent.granted',
          subjectType: 'contact',
          subjectId: contact.id,
          payload: { purpose: 'NETWORK_DISCOVERY' },
        });
      }
    }
    // Profile storage choice: latest application wins. Granted keeps the
    // profile for future applications; declined flags it for anonymization
    // once every process ends (enforced by the retention cron).
    const activeStorage = await tx.consentRecord.findFirst({
      where: { orgId: org.id, contactId: contact.id, purpose: 'PROFILE_STORAGE', withdrawnAt: null },
    });
    if (input.storeProfile) {
      if (!activeStorage) {
        await tx.consentRecord.create({
          data: { orgId: org.id, contactId: contact.id, purpose: 'PROFILE_STORAGE' },
        });
      }
    } else {
      if (activeStorage) {
        await tx.consentRecord.updateMany({
          where: { orgId: org.id, contactId: contact.id, purpose: 'PROFILE_STORAGE', withdrawnAt: null },
          data: { withdrawnAt: new Date() },
        });
      } else {
        // Explicit refusal marker so the retention cron can tell "declined"
        // apart from "never asked" (pre-feature applications).
        await tx.consentRecord.create({
          data: {
            orgId: org.id,
            contactId: contact.id,
            purpose: 'PROFILE_STORAGE',
            withdrawnAt: new Date(),
          },
        });
      }
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
      // The file is theirs (anonymization deletes it with them), and its text
      // status tells the resume-text cron whether another try is worth it.
      await tx.storedFile.update({
        where: { id: resume.fileId },
        data: { contactId: contact.id, ...textFields(resume.extracted, new Date()), ...parseQueueFields(resume.extracted.status, org) },
      });
      // Re-application with a fresh resume: update the existing contact
      if (contact.resumeFileId !== resume.fileId) {
        // Resumes stored before files had an owner would be orphaned here,
        // out of reach of anonymization; the one being replaced becomes theirs.
        if (contact.resumeFileId) {
          await tx.storedFile.updateMany({
            where: { id: contact.resumeFileId, contactId: null },
            data: { contactId: contact.id },
          });
        }
        await tx.contact.update({
          where: { id: contact.id },
          data: { resumeFileId: resume.fileId, resumeText },
        });
      }
    }
    return { ...opportunity, contactName: contact.name, contactId: contact.id };
  });
  invalidatePipelineCounts(org.id);
  invalidateContactCounts(org.id);

  // EEO self-ID: written OUTSIDE the application transaction and without any
  // contact/opportunity id — the segregation is structural, not access-based.
  if (org.collectEeo && input.eeo) {
    const clean = (v?: string) => (v && v.length <= 80 ? v : 'declined');
    await db.eeoResponse.create({
      data: {
        orgId: org.id,
        postingId: posting.id,
        gender: clean(input.eeo.gender),
        race: clean(input.eeo.race),
        veteran: clean(input.eeo.veteran),
        disability: clean(input.eeo.disability),
      },
    });
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
      });
    }
  }

  return opportunity;
}
