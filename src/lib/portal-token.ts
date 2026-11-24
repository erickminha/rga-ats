import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, expiring tokens for the candidate portal — no session, no schema.
 * Payload: contactId + orgId + expiry, HMAC'd with AUTH_SECRET.
 */

type PortalPayload = { contactId: string; orgId: string; exp: number; emailProof?: string };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required');
  return s;
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function portalEmailProof(email: string) {
  return sign(`portal-email:${email.trim().toLowerCase()}`);
}

export function createPortalToken(contactId: string, orgId: string, ttlDays = 14, email?: string): string {
  const payload: PortalPayload = {
    contactId,
    orgId,
    ...(email ? { emailProof: portalEmailProof(email) } : {}),
    exp: Date.now() + ttlDays * 86_400_000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function verifyPortalToken(token: string): PortalPayload | null {
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra !== undefined) return null;
  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as PortalPayload;
    if (typeof payload.contactId !== 'string' || !payload.contactId
      || typeof payload.orgId !== 'string' || !payload.orgId
      || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
