import { headers } from 'next/headers';

/** Public origin for candidate-facing links (offers, scheduling, portal). */
export function appBaseUrl(): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, '');
  // A production deployment's own URL sits behind Vercel's sign-in; its
  // production domain is what candidates can open.
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** Prefer the incoming request host so local/preview deploys get the right links. */
export async function requestBaseUrl(): Promise<string> {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    const origin = emailPublicOrigin();
    if (!origin) throw new Error('PUBLIC_ORIGIN_NOT_CONFIGURED');
    return origin;
  }
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${proto}://${host}`;
  } catch {
    // headers() throws outside a request (cron, scripts)
  }
  return appBaseUrl();
}

/** Origins for links carrying a bearer token must come from deployment configuration. */
export function emailPublicOrigin(): string | null {
  const configured = process.env.AUTH_URL
    || (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  const hosted = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
  if (!configured && hosted) return null;
  try {
    const url = new URL(configured ?? 'http://localhost:3000');
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol === 'https:') return url.origin;
    if (!hosted && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.origin;
  } catch {
    // Configuration may be absent on an instance that does not deliver email.
  }
  return null;
}
