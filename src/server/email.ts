import { lockIdentifiableContact } from '@/server/contact-lock';
import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { publicClientName } from '@/lib/public-careers';
import { emitEvent } from '@/server/events';
import { requireRecruitingAccess, type SessionContext } from '@/lib/session';

/**
 * Email delivery with merge tokens, scheduling, and automation.
 *
 * SMTP_URL takes precedence over the Resend SMTP configuration. With no
 * transport, development and tests simulate delivery. Production records a failure.
 *
 * Scheduling: messages with a future scheduledAt stay SCHEDULED until
 * processDueEmails() runs — wired to /api/cron/emails (Vercel Cron in the
 * managed setup, any cron + curl when self-hosting).
 */

export const MERGE_TOKENS = [
  'candidate_name',
  'first_name',
  'job_title',
  'company_name',
  'sender_name',
  'interview_title',
  'interview_time',
] as const;

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

export type EmailAttachment = { filename: string; content: string; contentType?: string };

class MailConfigurationError extends Error {}

export function emailDeliveryError(error: unknown): string {
  if (error instanceof MailConfigurationError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  const reason: Record<string, string> = {
    EAUTH: 'SMTP_AUTHENTICATION_FAILED',
    ETIMEDOUT: 'SMTP_TIMEOUT',
    ECONNECTION: 'SMTP_CONNECTION_FAILED',
    ESOCKET: 'SMTP_CONNECTION_FAILED',
    EENVELOPE: 'SMTP_ENVELOPE_REJECTED',
    EMESSAGE: 'SMTP_MESSAGE_REJECTED',
  };
  return typeof code === 'string' && Object.hasOwn(reason, code) ? reason[code] : 'SMTP_DELIVERY_FAILED';
}

async function transmitEmail(message: { toEmail: string; subject: string; body: string }, attachments?: EmailAttachment[]) {
  const smtp = process.env.SMTP_URL?.trim();
  const resend = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!smtp && !resend) {
    if (process.env.NODE_ENV === 'production') throw new MailConfigurationError('SMTP_NOT_CONFIGURED');
    return;
  }
  if (!smtp && !from) throw new MailConfigurationError('EMAIL_FROM_NOT_CONFIGURED');
  const transport = smtp ? nodemailer.createTransport(smtp) : nodemailer.createTransport({
    host: 'smtp.resend.com', port: 465, secure: true,
    auth: { user: 'resend', pass: resend! },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  await transport.sendMail({
    from: from || 'Source <no-reply@source.local>',
    to: message.toEmail, subject: message.subject, text: message.body, attachments,
  });
}

/** A password link is immediate and never belongs in the ATS email history. */
export function sendPrivateEmail(message: { toEmail: string; subject: string; body: string }) {
  return transmitEmail(message);
}

async function deliver(messageId: string, attachments?: EmailAttachment[], privateBody?: string) {
  const message = await db.$transaction(async (tx) => {
    const row = await tx.emailMessage.findUnique({ where: { id: messageId } });
    if (!row || row.status !== 'SCHEDULED' || row.deliveryClaimedAt) return null;
    const opportunity = !row.contactId && row.opportunityId ? await tx.opportunity.findFirst({
      where: { id: row.opportunityId, orgId: row.orgId }, select: { contactId: true },
    }) : null;
    const contactId = row.contactId ?? opportunity?.contactId;
    if (contactId) {
      if (!await lockIdentifiableContact(tx, row.orgId, contactId)) return null;
    }
    const claim = await tx.emailMessage.updateMany({
      where: { id: row.id, status: 'SCHEDULED', deliveryClaimedAt: null },
      data: { deliveryClaimedAt: new Date() },
    });
    return claim.count ? row : null;
  });
  if (!message) return null;

  try {
    await transmitEmail({ ...message, body: privateBody ?? message.body }, attachments);
    return await db.emailMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (error) {
    return await db.emailMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', error: emailDeliveryError(error) },
    });
  }
}

export type SendEmailInput = {
  orgId: string;
  actorId?: string; // user id; undefined = automation
  contactId?: string;
  opportunityId?: string;
  templateId?: string;
  toEmail: string;
  subject: string;
  body: string;
  vars?: Record<string, string>;
  scheduledAt?: Date;
  /** Delivery-time only (not persisted) — so immediate sends can carry .ics invites. */
  attachments?: EmailAttachment[];
};

export async function sendEmail(input: SendEmailInput, privateBody?: string) {
  const vars = input.vars ?? {};
  const isFuture = !!input.scheduledAt && input.scheduledAt.getTime() > Date.now();
  if (isFuture && privateBody !== undefined) throw new Error('Private email content cannot be scheduled');

  const message = await db.$transaction(async (tx) => {
    const opportunity = !input.contactId && input.opportunityId ? await tx.opportunity.findFirst({
      where: { id: input.opportunityId, orgId: input.orgId }, select: { contactId: true },
    }) : null;
    const contactId = input.contactId ?? opportunity?.contactId;
    if (contactId) {
      if (!await lockIdentifiableContact(tx, input.orgId, contactId)) throw new Error('Cadastro indisponível para envio.');
    }
    return tx.emailMessage.create({
      data: {
        orgId: input.orgId,
        contactId: contactId ?? null,
        opportunityId: input.opportunityId ?? null,
        templateId: input.templateId ?? null,
        senderId: input.actorId ?? null,
        toEmail: input.toEmail,
        subject: renderTemplate(input.subject, vars),
        body: renderTemplate(input.body, vars),
        scheduledAt: input.scheduledAt ?? null,
      },
    });
  });

  const result = isFuture ? message : await deliver(message.id, input.attachments, privateBody);
  if (input.opportunityId && (isFuture || result?.status === 'SENT')) {
    await db.$transaction(async (tx) => {
      await emitEvent(tx, {
        orgId: input.orgId,
        actorType: input.actorId ? 'user' : 'system',
        actorId: input.actorId,
        verb: isFuture ? 'email.scheduled' : 'email.sent',
        subjectType: 'opportunity',
        subjectId: input.opportunityId!,
        payload: {
          subject: message.subject,
          to: message.toEmail,
          ...(isFuture ? { scheduledAt: input.scheduledAt!.toISOString() } : {}),
        },
      });
    });
  }

  return result;
}

export async function cancelScheduledEmail(ctx: SessionContext, messageId: string) {
  requireRecruitingAccess(ctx);
  const message = await db.emailMessage.findFirst({
    where: { id: messageId, orgId: ctx.orgId, status: 'SCHEDULED', deliveryClaimedAt: null },
  });
  if (!message) throw new Error('Scheduled email not found');
  const updated = await db.emailMessage.updateMany({
    where: { id: message.id, status: 'SCHEDULED', deliveryClaimedAt: null },
    data: { status: 'CANCELED' },
  });
  if (!updated.count) throw new Error('O envio desta mensagem já começou.');
  if (message.opportunityId) {
    await db.$transaction(async (tx) => {
      await emitEvent(tx, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        verb: 'email.canceled',
        subjectType: 'opportunity',
        subjectId: message.opportunityId!,
        payload: { subject: message.subject },
      });
    });
  }
  return db.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
}

/** Deliver everything due. Called from /api/cron/emails. */
export async function processDueEmails(): Promise<number> {
  // After a crash SMTP may already have accepted the message.
  await db.emailMessage.updateMany({
    where: { status: 'SCHEDULED', deliveryClaimedAt: { lte: new Date(Date.now() - 30 * 60_000) } },
    data: { status: 'FAILED', error: 'SMTP_DELIVERY_UNCERTAIN' },
  });
  const due = await db.emailMessage.findMany({
    where: { status: 'SCHEDULED', deliveryClaimedAt: null, scheduledAt: { not: null, lte: new Date() } },
    take: 100,
  });
  for (const message of due) {
    const result = await deliver(message.id);
    if (message.opportunityId && result?.status === 'SENT') {
      await db.$transaction(async (tx) => {
        await emitEvent(tx, {
          orgId: message.orgId,
          actorType: 'system',
          verb: 'email.sent',
          subjectType: 'opportunity',
          subjectId: message.opportunityId!,
          payload: { subject: message.subject, to: message.toEmail },
        });
      });
    }
  }
  return due.length;
}

/** Merge vars for an opportunity: candidate, role, and hiring company names. */
export async function buildOpportunityVars(
  opportunityId: string,
  extra: Record<string, string> = {},
): Promise<{ vars: Record<string, string>; toEmail: string | null; contactId: string }> {
  const opp = await db.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      contact: true,
      org: true,
      posting: { include: { clientCompany: { select: { id: true, orgId: true, name: true } } } },
    },
  });
  if (!opp) throw new Error('Opportunity not found');
  return {
    toEmail: opp.contact.emails[0] ?? null,
    contactId: opp.contactId,
    vars: {
      candidate_name: opp.contact.name,
      first_name: opp.contact.name.split(' ')[0] ?? opp.contact.name,
      job_title: opp.posting?.title ?? 'the role',
      company_name: (opp.posting?.orgId === opp.orgId && publicClientName(opp.posting)) || opp.org.name,
      ...extra,
    },
  };
}

// ---------- Templates ----------

export const LEGACY_EMAIL_TEMPLATES = [
  {
    name: 'Application received',
    subject: 'We received your application — {{job_title}}',
    body: 'Hi {{first_name}},\n\nThanks for applying to {{job_title}} at {{company_name}}. Our team is reviewing applications and will be in touch about next steps.\n\nBest,\n{{company_name}} Recruiting',
  },
  {
    name: 'Rejection',
    subject: 'Update on your application — {{job_title}}',
    body: 'Hi {{first_name}},\n\nThank you for taking the time to apply to {{job_title}} at {{company_name}}. After careful consideration we have decided not to move forward at this time.\n\nWe appreciate your interest and encourage you to apply to future openings.\n\nBest,\n{{company_name}} Recruiting',
  },
  {
    name: 'Interview scheduled',
    subject: 'Interview confirmed: {{interview_title}} — {{job_title}}',
    body: 'Hi {{first_name}},\n\nYour {{interview_title}} for {{job_title}} at {{company_name}} is confirmed for {{interview_time}}.\n\nWe look forward to speaking with you!\n\nBest,\n{{company_name}} Recruiting',
  },
];

export const DEFAULT_TEMPLATES = [
  {
    name: 'Candidatura recebida',
    subject: 'Recebemos sua candidatura para {{job_title}}',
    body: 'Olá, {{first_name}}!\n\nRecebemos sua candidatura para {{job_title}}. A equipe de {{company_name}} vai analisar seu perfil e poderá entrar em contato sobre as próximas etapas.\n\nEquipe de recrutamento de {{company_name}}',
  },
  {
    name: 'Devolutiva de seleção',
    subject: 'Atualização sobre sua candidatura para {{job_title}}',
    body: 'Olá, {{first_name}}!\n\nAgradecemos seu interesse na vaga de {{job_title}}. Após analisar a candidatura, decidimos seguir com outras pessoas nesta seleção. Você poderá se candidatar a futuras oportunidades.\n\nEquipe de recrutamento de {{company_name}}',
  },
  {
    name: 'Entrevista agendada',
    subject: 'Entrevista confirmada para {{job_title}}',
    body: 'Olá, {{first_name}}!\n\nSua entrevista ({{interview_title}}) para {{job_title}} está confirmada para {{interview_time}}.\n\nEquipe de recrutamento de {{company_name}}',
  },
];

export function localizedEmailTemplate(template: { name: string; subject: string; body: string }) {
  const index = LEGACY_EMAIL_TEMPLATES.findIndex((legacy) =>
    legacy.name === template.name && legacy.subject === template.subject && legacy.body === template.body);
  return DEFAULT_TEMPLATES[index] ?? template;
}

export async function createTemplate(
  ctx: SessionContext,
  input: { name: string; subject: string; body: string },
) {
  return db.emailTemplate.create({ data: { orgId: ctx.orgId, ...input } });
}

export async function updateTemplate(
  ctx: SessionContext,
  templateId: string,
  input: { name: string; subject: string; body: string },
) {
  const template = await db.emailTemplate.findFirst({
    where: { id: templateId, orgId: ctx.orgId },
  });
  if (!template) throw new Error('Template not found');
  return db.emailTemplate.update({ where: { id: template.id }, data: input });
}

export async function deleteTemplate(ctx: SessionContext, templateId: string) {
  const template = await db.emailTemplate.findFirst({
    where: { id: templateId, orgId: ctx.orgId },
  });
  if (!template) throw new Error('Template not found');
  // Detach from automation slots that reference it
  await db.organization.updateMany({
    where: { id: ctx.orgId, autoConfirmTemplateId: template.id },
    data: { autoConfirmTemplateId: null },
  });
  await db.organization.updateMany({
    where: { id: ctx.orgId, autoRejectTemplateId: template.id },
    data: { autoRejectTemplateId: null },
  });
  await db.organization.updateMany({
    where: { id: ctx.orgId, autoInterviewTemplateId: template.id },
    data: { autoInterviewTemplateId: null },
  });
  return db.emailTemplate.delete({ where: { id: template.id } });
}

export async function updateEmailAutomation(
  ctx: SessionContext,
  input: {
    autoConfirmTemplateId: string | null;
    autoRejectTemplateId: string | null;
    autoInterviewTemplateId: string | null;
    autoRejectDelayHours: number;
  },
) {
  return db.organization.update({
    where: { id: ctx.orgId },
    data: {
      autoConfirmTemplateId: input.autoConfirmTemplateId,
      autoRejectTemplateId: input.autoRejectTemplateId,
      autoInterviewTemplateId: input.autoInterviewTemplateId,
      autoRejectDelayHours: Math.max(0, input.autoRejectDelayHours),
    },
  });
}
