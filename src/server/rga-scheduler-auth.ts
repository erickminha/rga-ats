import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cronAuthorized } from './cron';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 4000 });

export async function talentSchedulerAuthorized(request: Request) {
  if (cronAuthorized(request)) return true;
  const email = process.env.RGA_TALENT_SCHEDULER_EMAIL;
  const audience = process.env.RGA_TALENT_SCHEDULER_AUDIENCE;
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]{1,4096})$/)?.[1];
  if (!email || !audience || !token) return false;
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'], maxTokenAge: '1h' });
    return payload.email === email && payload.email_verified === true;
  } catch { return false; }
}
