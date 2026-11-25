import { db } from '@/lib/db';
import { isAdmin, type SessionContext } from '@/lib/session';
import { discAiModels, discAiProviders, discChat } from './ai-client';
import { actorOf, emitEvent } from './events';
import { reserveRequest } from './request-limit';
import { validatedDiscInterpretation } from '@/lib/native-disc';

function limit(raw: string | undefined, fallback: number) {
  const value = Number(raw ?? fallback);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function discAiLimits() {
  return { daily: limit(process.env.RGA_DISC_AI_DAILY_LIMIT, 20), monthly: limit(process.env.RGA_DISC_AI_MONTHLY_LIMIT, 200) };
}

export async function discAiConfiguration(orgId: string) {
  const approved = discAiProviders().map(provider => ({ provider, models: discAiModels(provider) }));
  const caps = discAiLimits();
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { discAiSettings: true } });
  const saved = org?.discAiSettings as { providers?: { provider: string; model: string }[]; daily?: number; monthly?: number } | null;
  const providers = (Array.isArray(saved?.providers) ? saved.providers : approved.map(x => ({ provider: x.provider, model: x.models[0] })))
    .filter(x => approved.some(p => p.provider === x.provider && p.models.includes(x.model))).slice(0, 3);
  const bounded = (value: unknown, maximum: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, maximum) : maximum;
  return { approved, providers, caps, daily: bounded(saved?.daily, caps.daily), monthly: bounded(saved?.monthly, caps.monthly) };
}

export async function reserveDiscAi(orgId: string, daily: number, monthly: number) {
  const day = new Date().toISOString().slice(0, 10);
  const globalDaily = limit(process.env.RGA_DISC_AI_GLOBAL_DAILY_LIMIT, 20);
  const globalMonthly = limit(process.env.RGA_DISC_AI_GLOBAL_MONTHLY_LIMIT, 200);
  if (!daily || !monthly || !globalDaily || !globalMonthly) return false;
  return await reserveRequest('disc-ai-daily', [orgId, day], daily, 86400000) &&
    await reserveRequest('disc-ai-monthly', [orgId, day.slice(0, 7)], monthly, 31 * 86400000) &&
    await reserveRequest('disc-ai-global-daily', [day], globalDaily, 86400000) &&
    await reserveRequest('disc-ai-global-monthly', [day.slice(0, 7)], globalMonthly, 31 * 86400000);
}

export async function saveDiscAiConfiguration(ctx: SessionContext, form: FormData) {
  if (!isAdmin(ctx)) throw new Error('Acesso restrito.');
  const current = await discAiConfiguration(ctx.orgId);
  const daily = Number(form.get('daily')), monthly = Number(form.get('monthly'));
  if (!Number.isSafeInteger(daily) || daily < 0 || daily > current.caps.daily ||
      !Number.isSafeInteger(monthly) || monthly < 0 || monthly > current.caps.monthly) throw new Error('Limite inválido.');
  const providers: { provider: string; model: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const choice = String(form.get('slot' + i) ?? '');
    if (!choice) continue;
    const [provider, model] = choice.split('|');
    if (!current.approved.some(x => x.provider === provider && x.models.includes(model)) || providers.some(x => x.provider === provider)) throw new Error('Provedor ou modelo inválido.');
    providers.push({ provider, model });
  }
  await db.$transaction(async tx => {
    await tx.organization.update({ where: { id: ctx.orgId }, data: { discAiSettings: { providers, daily, monthly } } });
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.ai_configured', subjectType: 'organization', subjectId: ctx.orgId, payload: { providers, daily, monthly } });
  });
}

export async function testDiscAi(ctx: SessionContext, provider: string, model: string) {
  if (!isAdmin(ctx)) throw new Error('Acesso restrito.');
  const config = await discAiConfiguration(ctx.orgId);
  if (!config.providers.some(x => x.provider === provider && x.model === model) ||
      !await reserveRequest('disc-ai-test', [ctx.orgId], 3, 3600000) ||
      !await reserveDiscAi(ctx.orgId, config.daily, config.monthly)) throw new Error('Teste indisponível.');
  let tokens: number | null = null;
  let success = false;
  try {
    const result = await discChat(provider, { scores: { D: 40, I: 30, S: 20, C: 10 }, methodology: 'teste-sintetico', profile: 'D/I' }, model);
    tokens = result.tokens;
    success = !!validatedDiscInterpretation(result.value);
  } catch { /* The UI reports fixed messages, never provider response bodies. */ }
  await db.$transaction(async tx => {
    await emitEvent(tx, { orgId: ctx.orgId, ...actorOf(ctx), verb: 'disc.ai_tested', subjectType: 'organization', subjectId: ctx.orgId, payload: { provider, model, tokens, success } });
  });
  return success;
}
