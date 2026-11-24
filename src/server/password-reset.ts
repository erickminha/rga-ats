import { createHash, createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { emailPublicOrigin } from '@/lib/base-url';
import { emailDeliveryError, sendPrivateEmail } from '@/server/email';

const HOUR = 60 * 60 * 1000;
const TOKEN_LIFETIME = 30 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function resetEmailAddress(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export function validResetPassword(password: string) {
  return password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72;
}

async function reserve(key: string, limit: number, now: Date) {
  const expiresAt = new Date(now.getTime() + HOUR);
  const result = await db.$executeRaw`
    INSERT INTO "PasswordResetLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
    SET "count" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN 1 ELSE "PasswordResetLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "PasswordResetLimit"."expiresAt" END
    WHERE "PasswordResetLimit"."expiresAt" <= ${now} OR "PasswordResetLimit"."count" < ${limit}
  `;
  return result === 1;
}

export async function requestPasswordReset(email: string) {
  const normalized = resetEmailAddress(email);
  const origin = emailPublicOrigin();
  const secret = process.env.AUTH_SECRET;
  if (!normalized) return;
  if (!origin || !secret) {
    console.warn('[password-reset] PUBLIC_ORIGIN_OR_AUTH_SECRET_NOT_CONFIGURED');
    return;
  }

  const now = new Date();
  if (!await reserve('global', 300, now)) return;
  const addressKey = createHmac('sha256', secret).update(`password-reset:${normalized}`).digest('hex');
  if (!await reserve(addressKey, 3, now)) return;

  await db.passwordResetLimit.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } });

  // Credential invites can share an address across orgs. An ambiguous match
  // must not pick or change a password in an arbitrary workspace.
  const users = await db.user.findMany({
    where: { email: normalized, deactivatedAt: null, passwordHash: { not: null } },
    select: { id: true },
    take: 2,
  });
  if (users.length !== 1) return;

  const userId = users[0].id;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME);
  await db.passwordResetToken.upsert({ where: { userId }, create: { userId, tokenHash, expiresAt }, update: { tokenHash, expiresAt } });

  const link = new URL('/login/redefinir-senha', origin);
  // Fragments never travel in GET requests, so access logs cannot capture the token.
  link.hash = `token=${token}`;
  try {
    await sendPrivateEmail({
      toEmail: normalized,
      subject: 'Redefina sua senha do RGA ATS',
      body: `Use o link abaixo para cadastrar uma nova senha no RGA ATS. Ele é válido por 30 minutos e pode ser usado uma vez.\n\n${link.href}\n\nSe você não solicitou a recuperação, ignore este e-mail.`,
    });
  } catch (error) {
    await db.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.warn('[password-reset]', emailDeliveryError(error));
  }
}

export async function resetPassword(token: string, password: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token) || !validResetPassword(password)) return false;
  const tokenHash = hash(token);
  const reset = await db.passwordResetToken.findUnique({
    where: { tokenHash, expiresAt: { gt: new Date() }, user: { deactivatedAt: null, passwordHash: { not: null } } },
    select: { userId: true },
  });
  if (!reset) return false;
  const passwordHash = await bcrypt.hash(password, 12);
  return db.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.deleteMany({ where: { tokenHash, expiresAt: { gt: new Date() } } });
    if (!consumed.count) return false;
    const updated = await tx.user.updateMany({
      where: { id: reset.userId, deactivatedAt: null, passwordHash: { not: null } },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    return updated.count === 1;
  });
}
