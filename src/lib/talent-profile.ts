export const statesBR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const availabilityLabels = {
  IMMEDIATE: 'Disponibilidade imediata',
  NOTICE: 'Disponibilidade após aviso prévio',
  NEGOTIABLE: 'Disponibilidade a combinar',
  UNAVAILABLE: 'Indisponível',
} as const;

export const careerFields = {
  state: 'Estado (UF)',
  education: 'Escolaridade',
  skills: 'Competências',
  experience: 'Experiência profissional',
  whatsapp: 'WhatsApp',
  availability: 'Disponibilidade profissional',
} as const;

export function readCareerProfile(value: unknown): Partial<Record<keyof typeof careerFields, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, data]) =>
    Object.hasOwn(careerFields, key) && typeof data === 'string'));
}

export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits;
}

export const formatSalary = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function parseSalary(value: string) {
  if (!value) return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) throw new Error('Informe a pretensão salarial em reais. Ex.: 3.500,00.');
  const [reais, fraction = ''] = value.replace(/\./g, '').split(',');
  const cents = Number(reais) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 2_147_483_647) throw new Error('Pretensão salarial acima do limite.');
  return cents;
}
