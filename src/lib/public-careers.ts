import { appLocale } from '@/lib/i18n';

export const noIndex = { index: false, follow: false } as const;

export function postingContent(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function publicClientName(posting: {
  content: unknown;
  orgId: string;
  clientCompany: { id: string; orgId: string; name: string } | null;
}) {
  const client = posting.clientCompany;
  return client?.orgId === posting.orgId && postingContent(posting.content).publicClientCompanyId === client.id
    ? client.name
    : null;
}

export function publicPostingText(content: unknown) {
  const object = postingContent(content);
  const description = typeof object.description === 'string' ? object.description.trim() : '';
  const requirements = Array.isArray(object.requirements)
    ? object.requirements.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim())
    : typeof object.requirements === 'string' ? object.requirements.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  return { description, requirements };
}

export function formatPublicSalary(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return null;
  const number = new Intl.NumberFormat(appLocale);
  let format = (amount: number) => number.format(amount);
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    const money = new Intl.NumberFormat(appLocale, { style: 'currency', currency, maximumFractionDigits: 0 });
    format = (amount) => money.format(amount);
  }
  if (min == null) return `Até ${format(max!)}`;
  if (max == null) return `A partir de ${format(min)}`;
  return min === max ? format(min) : `${format(min)} a ${format(max)}`;
}

export function careersPath(org: string, posting?: string) {
  const root = `/careers/${encodeURIComponent(org)}`;
  return posting ? `${root}/${encodeURIComponent(posting)}` : root;
}

export function jsonLd(data: object) {
  // Keep administrator-entered description text inside the script element.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function publicPostingLogo(posting: Parameters<typeof publicClientName>[0] & { logoFileId: string | null }, agency: boolean) {
  if (!posting.logoFileId) return null;
  if (!posting.clientCompany) return agency ? null : posting.logoFileId;
  return publicClientName(posting) && postingContent(posting.content).publicClientLogoId === posting.logoFileId
    ? posting.logoFileId : null;
}
