import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';

function limitKey(scope: string, identity: string[]) {
  return createHmac('sha256', authConfig.secret).update(JSON.stringify([scope, ...identity])).digest('hex');
}

export async function requestLimitActive(scope: string, identity: string[]) {
  const row = await db.passwordResetLimit.findUnique({ where: { key: limitKey(scope, identity) }, select: { expiresAt: true } });
  return !!row && +row.expiresAt > Date.now();
}

/** Reuse the persisted counter table. Store neither addresses nor user-supplied IPs. */
export async function reserveRequest(scope: string, identity: string[], limit: number, windowMs: number, cost = 1) {
  if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(limit) || limit < cost || !Number.isFinite(windowMs) || windowMs <= 0) return false;
  if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && !process.env.AUTH_SECRET?.trim()) return false;
  const key = limitKey(scope, identity);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const changed = await db.$executeRaw`
    INSERT INTO "PasswordResetLimit" ("key", "count", "expiresAt") VALUES (${key}, ${cost}, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
    SET "count" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN ${cost} ELSE "PasswordResetLimit"."count" + ${cost} END,
        "expiresAt" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "PasswordResetLimit"."expiresAt" END
    WHERE "PasswordResetLimit"."expiresAt" <= ${now} OR "PasswordResetLimit"."count" <= ${limit - cost}
  `;
  return changed === 1;
}

/** Adjust a prior reservation once the upstream reports the actual usage. Never revive an expired counter. */
export async function settleReservedRequest(scope: string, identity: string[], reserved: number, actual: number) {
  if (!Number.isSafeInteger(reserved) || reserved < 1 || !Number.isSafeInteger(actual) || actual < 0 || actual > 10_000_000) return;
  const delta = actual - reserved;
  if (!delta) return;
  const key = limitKey(scope, identity);
  await db.$executeRaw`
    UPDATE "PasswordResetLimit" SET "count" = GREATEST(0, "count" + ${delta})
    WHERE "key" = ${key} AND "expiresAt" > ${new Date()}
  `;
}
