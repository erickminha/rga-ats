import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';

/** Reuse the persisted counter table. Store neither addresses nor user-supplied IPs. */
export async function reserveRequest(scope: string, identity: string[], limit: number, windowMs: number) {
  if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && !process.env.AUTH_SECRET?.trim()) return false;
  const key = createHmac('sha256', authConfig.secret).update(JSON.stringify([scope, ...identity])).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const changed = await db.$executeRaw`
    INSERT INTO "PasswordResetLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
    SET "count" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN 1 ELSE "PasswordResetLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "PasswordResetLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "PasswordResetLimit"."expiresAt" END
    WHERE "PasswordResetLimit"."expiresAt" <= ${now} OR "PasswordResetLimit"."count" < ${limit}
  `;
  return changed === 1;
}
