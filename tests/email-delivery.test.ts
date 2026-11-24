import nodemailer from 'nodemailer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailPublicOrigin } from '@/lib/base-url';
import { db } from '@/lib/db';
import { emailDeliveryError, processDueEmails, sendEmail, sendPrivateEmail } from '@/server/email';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const toEmail = 'teste@example.invalid';

beforeEach(() => {
  for (const key of ['SMTP_URL', 'RESEND_API_KEY', 'EMAIL_FROM', 'AUTH_URL', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL']) vi.stubEnv(key, '');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('email transport and public origin', () => {
  it('uses Resend over TLS and the configured sender, keeping SMTP_URL precedence', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const transport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    vi.stubEnv('RESEND_API_KEY', 'smtp-test-key');
    vi.stubEnv('EMAIL_FROM', 'RGA ATS <teste@example.invalid>');
    const message = { toEmail, subject: 'Teste fictício', body: 'Texto fictício' };
    await sendPrivateEmail(message);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: 'smtp-test-key' },
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'RGA ATS <teste@example.invalid>', to: toEmail }));
    vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:2525');
    await sendPrivateEmail(message);
    expect(transport.mock.calls[1]).toEqual(['smtp://127.0.0.1:2525']);
  });

  it('requires a sender for Resend and suppresses raw SMTP errors', async () => {
    vi.stubEnv('RESEND_API_KEY', 'smtp-test-key');
    await expect(sendPrivateEmail({ toEmail, subject: 'Teste', body: 'Teste' })).rejects.toThrow('EMAIL_FROM_NOT_CONFIGURED');
    expect(emailDeliveryError(Object.assign(new Error('private raw contents'), { code: 'EAUTH' }))).toBe('SMTP_AUTHENTICATION_FAILED');
  });

  it('derives links from configured HTTPS in production, with no request-host fallback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(emailPublicOrigin()).toBeNull();
    vi.stubEnv('AUTH_URL', 'http://homolog.example.test');
    expect(emailPublicOrigin()).toBeNull();
    vi.stubEnv('AUTH_URL', 'https://homolog.example.test/some/path');
    expect(emailPublicOrigin()).toBe('https://homolog.example.test');
  });
});

describe.skipIf(!hasDb)('email history and delivery', () => {
  it('records immediate and scheduled delivery failures without claiming email was sent', async () => {
    const { org, stages } = await createOrg();
    const person = await db.contact.create({ data: { orgId: org.id, name: 'Pessoa fictícia' } });
    const opportunity = await db.opportunity.create({ data: { orgId: org.id, contactId: person.id, stageId: stages[0].id } });
    const message = { orgId: org.id, opportunityId: opportunity.id, toEmail, subject: 'Assunto de teste', body: 'Teste fictício' };
    vi.stubEnv('NODE_ENV', 'production');
    expect(await sendEmail(message)).toMatchObject({ status: 'FAILED', error: 'SMTP_NOT_CONFIGURED', sentAt: null });
    const scheduled = await sendEmail({ ...message, scheduledAt: new Date(Date.now() + 60_000) });
    expect(scheduled).toMatchObject({ status: 'SCHEDULED' });
    await db.emailMessage.update({ where: { id: scheduled!.id }, data: { scheduledAt: new Date(0) } });
    await processDueEmails();
    expect(await db.emailMessage.findUniqueOrThrow({ where: { id: scheduled!.id } })).toMatchObject({ status: 'FAILED', sentAt: null });
    expect(await db.event.count({ where: { orgId: org.id, verb: 'email.sent' } })).toBe(0);
  });

  it('claims a scheduled delivery once across simultaneous workers', async () => {
    const { org } = await createOrg();
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:2525');
    const scheduled = await sendEmail({
      orgId: org.id, toEmail, subject: 'Fixture', body: 'Teste fictício', scheduledAt: new Date(Date.now() + 60_000),
    });
    await db.emailMessage.update({ where: { id: scheduled!.id }, data: { scheduledAt: new Date(0) } });
    await Promise.all([processDueEmails(), processDueEmails(), processDueEmails()]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(await db.emailMessage.findUnique({ where: { id: scheduled!.id } })).toMatchObject({ status: 'SENT' });
  });

  it('keeps only a sanitized provider error in persistent history', async () => {
    const { org } = await createOrg();
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error('private raw contents'), { code: 'EAUTH' }));
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:2525');
    const message = await sendEmail({ orgId: org.id, toEmail, subject: 'Teste', body: 'Resumo sem link' }, 'https://example.invalid/private');
    expect(message).toMatchObject({ status: 'FAILED', error: 'SMTP_AUTHENTICATION_FAILED', body: 'Resumo sem link' });
  });
});
