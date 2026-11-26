import { reserveRequest, settleReservedRequest } from './request-limit';

type Reservation = { settle: (actual: number | null) => Promise<void> };

export async function reserveGroq(payload: string, maxOutput: number): Promise<Reservation | null> {
  const requestLimit = process.env.RGA_GROQ_DAILY_REQUESTS;
  const tokenLimit = process.env.RGA_GROQ_DAILY_TOKENS;
  if (!requestLimit && !tokenLimit) return process.env.RGA_SUMMARY_ALLOW_GROQ !== 'true' ? { settle: async () => {} } : null;
  const day = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
  const identity = [day];
  // Conservative in-flight reservation, reconciled only after reliable upstream usage.
  const estimate = Buffer.byteLength(payload) + maxOutput + 256;
  if (!await reserveRequest('rga-groq-global-requests', identity, Number(requestLimit), 86400000)) return null;
  if (!await reserveRequest('rga-groq-global-tokens', identity, Number(tokenLimit), 86400000, estimate)) {
    await settleReservedRequest('rga-groq-global-requests', identity, 1, 0);
    return null;
  }
  let settled = false;
  return { settle: async actual => {
    if (settled || actual === null || !Number.isSafeInteger(actual) || actual <= 0) return;
    settled = true;
    await settleReservedRequest('rga-groq-global-tokens', identity, estimate, actual);
  } };
}
