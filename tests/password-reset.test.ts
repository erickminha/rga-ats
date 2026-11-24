import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { requestPasswordReset, resetPassword, validResetPassword } from '@/server/password-reset';
import { createOrg } from './fixtures';
import { fakeSmtp } from './fake-smtp';
import { hasDb } from './setup';

const oldPassword = 'senha-local-ficticia';
const newPassword = 'nova-senha-local-ficticia';

function tokenFrom(mail: string) {
  const match = mail.match(/https:\/\/homolog\.example\.test\/login\/redefinir-senha#token=([A-Za-z0-9_-]{43})/);
  expect(match).toBeTruthy();
  return match![1];
}

describe('password policy', () => {
  it('rejects short and overlong passwords, including multi-byte input', () => {
    expect(validResetPassword('curta')).toBe(false);
    expect(validResetPassword('🔒'.repeat(19))).toBe(false);
    expect(validResetPassword('a'.repeat(72))).toBe(true);
  });
});

describe.skipIf(!hasDb)('password recovery with simulated SMTP', () => {
  let smtp: Awaited<ReturnType<typeof fakeSmtp>>;
  const account = async () => {
    const { org, admin } = await createOrg();
    return db.user.update({ where: { id: admin.id }, data: {
      email: `${randomUUID()}@example.invalid`, passwordHash: await bcrypt.hash(oldPassword, 4),
    }, include: { org: true } });
  };

  beforeAll(async () => { smtp = await fakeSmtp(); });
  afterAll(() => smtp.close());
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'test-session-secret');
    vi.stubEnv('AUTH_URL', 'https://homolog.example.test');
    vi.stubEnv('SMTP_URL', smtp.url);
    smtp.messages.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('delivers only the private link and changes only the eligible account once, even on concurrent submissions', async () => {
    const user = await account();
    const { org: other } = await createOrg();
    const google = await db.user.create({ data: { orgId: other.id, email: user.email, name: 'Fictícia', googleSub: 'google-ficticio' } });
    await requestPasswordReset(user.email.toUpperCase());
    expect(smtp.messages).toHaveLength(1);
    const token = tokenFrom(smtp.messages[0]);
    const saved = await db.passwordResetToken.findUniqueOrThrow({ where: { userId: user.id } });
    expect(saved.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(await db.emailMessage.count({ where: { toEmail: user.email } })).toBe(0);

    const attempts = await Promise.all([resetPassword(token, newPassword), resetPassword(token, newPassword)]);
    expect(attempts.sort()).toEqual([false, true]);
    expect(await resetPassword(token, newPassword)).toBe(false);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare(newPassword, updated.passwordHash!)).toBe(true);
    expect(await bcrypt.compare(oldPassword, updated.passwordHash!)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: google.id } })).passwordHash).toBeNull();
  });

  it('rejects expiry, token tampering and attempts without a token', async () => {
    const user = await account();
    await requestPasswordReset(user.email);
    const token = tokenFrom(smtp.messages[0]);
    await db.passwordResetToken.update({
      where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await resetPassword(token, newPassword)).toBe(false);
    expect(await resetPassword(token.slice(1), newPassword)).toBe(false);
    expect(await resetPassword('', newPassword)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
  });

  it('suppresses Google-only, deactivated, ambiguous and unknown accounts', async () => {
    const user = await account();
    const inactive = await account();
    const { org, admin } = await createOrg();
    const googleEmail = admin.email;
    await db.user.update({ where: { id: inactive.id }, data: { deactivatedAt: new Date() } });
    await db.user.create({ data: { orgId: org.id, email: user.email, name: 'Duplicada fictícia', passwordHash: user.passwordHash } });
    for (const email of [user.email, inactive.email, googleEmail, 'ausente@example.invalid']) await requestPasswordReset(email);
    expect(smtp.messages).toHaveLength(0);
  });

  it('limits repeated requests and invalidates superseded links', async () => {
    const user = await account();
    for (let i = 0; i < 5; i++) await requestPasswordReset(user.email);
    expect(smtp.messages).toHaveLength(3);
    const [first, , latest] = smtp.messages.map(tokenFrom);
    expect(await resetPassword(first, newPassword)).toBe(false);
    expect(await resetPassword(latest, newPassword)).toBe(true);
  });

  it('does not keep a usable token on production delivery failure', async () => {
    const user = await account();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('RESEND_API_KEY', '');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await requestPasswordReset(user.email);
      expect(warning).toHaveBeenCalledWith('[password-reset]', 'SMTP_NOT_CONFIGURED');
      expect(await db.passwordResetToken.findUnique({ where: { userId: user.id } })).toBeNull();
      expect(await db.emailMessage.count({ where: { toEmail: user.email } })).toBe(0);
    } finally {
      warning.mockRestore();
    }
  });
});
