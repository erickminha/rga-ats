import { reserveRequest } from './request-limit';

export async function reserveGroq(payload: string, maxOutput: number) {
  const requestLimit = process.env.RGA_GROQ_DAILY_REQUESTS;
  const tokenLimit = process.env.RGA_GROQ_DAILY_TOKENS;
  if (!requestLimit && !tokenLimit) return process.env.RGA_SUMMARY_ALLOW_GROQ !== 'true';
  const day = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
  // Reserve conservatively using UTF-8 bytes, output ceiling and message overhead.
  const estimate = Buffer.byteLength(payload) + maxOutput + 256;
  return await reserveRequest('rga-groq-global-requests', [day], Number(requestLimit), 86400000) &&
    await reserveRequest('rga-groq-global-tokens', [day], Number(tokenLimit), 86400000, estimate);
}
