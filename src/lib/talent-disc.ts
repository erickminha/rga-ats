import { discScale } from '@/lib/competency-assessment';

export function discField(form: FormData, name: string, max: number, required = false) {
  const input = form.get(name);
  if (input !== null && typeof input !== 'string') throw new Error('Campo inválido.');
  const value = (input ?? '').trim();
  if (value.length > max || (required && !value)) throw new Error('Confira os campos obrigatórios e os limites.');
  return value;
}

export function discDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Informe uma data válida.');
  return new Date(value + 'T00:00:00Z');
}

export function externalDiscLink(value: string) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || value.length > 2000)
    throw new Error('Use o endereço HTTPS do fornecedor autorizado, sem credenciais na URL.');
  return url.href;
}

export function externalDiscResult(form: FormData, instrument: string, today: string) {
  const date = discField(form, 'date', 10, true);
  discDate(date);
  if (date > today) throw new Error('A data da avaliação não pode estar no futuro.');
  const until = discField(form, 'validUntil', 10);
  const validUntil = until ? discDate(until) : null;
  if (until && until < date) throw new Error('A validade não pode anteceder a avaliação.');
  const scaleMin = discField(form, 'scaleMin', 20);
  const scaleMax = discField(form, 'scaleMax', 20);
  const scale = discScale(scaleMin, scaleMax);
  const axes = Object.fromEntries(['D', 'I', 'S', 'C'].map(axis => [axis, discField(form, axis, 40)]));
  const values = Object.values(axes);
  if ((scaleMin || scaleMax) && !scale) throw new Error('Informe uma escala válida.');
  if (values.some(Boolean) && (!scale || !values.every(value => value && scale.parse(value) >= scale.min && scale.parse(value) <= scale.max)))
    throw new Error('Informe os quatro resultados na escala original do instrumento.');
  return {
    validUntil,
    result: { instrument, date, profile: discField(form, 'profile', 200, true), ...axes,
      scaleMin, scaleMax, scaleName: discField(form, 'scaleName', 100),
      traits: discField(form, 'traits', 2500), strengths: discField(form, 'strengths', 1500),
      development: discField(form, 'development', 1500), communication: discField(form, 'communication', 1500),
      notes: discField(form, 'notes', 1500), complete: true },
  };
}

export function discToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date());
}

export function reusableDisc(validUntil: Date | null, date: unknown, today: string, maxDays = 0) {
  if (!validUntil || validUntil.toISOString().slice(0, 10) < today || typeof date !== 'string') return false;
  try {
    const age = (discDate(today).getTime() - discDate(date).getTime()) / 86400000;
    return age >= 0 && (!Number.isSafeInteger(maxDays) || maxDays <= 0 || age <= maxDays);
  } catch { return false; }
}
