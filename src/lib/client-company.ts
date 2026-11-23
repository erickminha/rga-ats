export const brazilianStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const companyFields = {
  name: 'Nome fantasia ou nome de identificação',
  legalName: 'Razão social',
  cnpj: 'CNPJ',
  stateRegistration: 'Inscrição estadual',
  segment: 'Segmento de atividade',
  size: 'Porte da empresa',
  responsibleName: 'Nome do responsável',
  responsibleRole: 'Cargo do responsável',
  phone: 'Telefone',
  secondaryPhone: 'Telefone 2',
  whatsapp: 'WhatsApp',
  channels: 'Canais de contato',
  email: 'E-mail',
  website: 'Site',
  postalCode: 'CEP',
  address: 'Endereço',
  city: 'Cidade',
  state: 'Estado (UF)',
  source: 'Origem do cliente',
  notes: 'Observações internas',
} as const;

export type CompanyField = keyof typeof companyFields;

export function companyNameKey(name: string) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const digits = (value: string) => value.replace(/\D/g, '');
export const cnpjKey = (value: string) => value.toUpperCase().replace(/[.\/\s-]/g, '');

export function validCnpj(value: string) {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value) || /^([0-9])\1{13}$/.test(value)) return false;
  const digit = (input: string) => {
    let weight = 2;
    let sum = 0;
    for (let i = input.length - 1; i >= 0; i--) {
      sum += (input.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  };
  const root = value.slice(0, 12);
  const first = digit(root);
  return root + first + digit(root + first) === value;
}

export function maskCnpj(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14)
    .replace(/^(..)(.)/, '$1.$2').replace(/^(..\....)(.)/, '$1.$2')
    .replace(/^(..\....\....)(.)/, '$1/$2').replace(/^(..\....\....\/....)(.)/, '$1-$2');
}

export function maskPostalCode(value: string) {
  return digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

export function maskPhone(value: string) {
  const number = digits(value.replace(/^\s*\+55\s*/, '')).slice(0, 11);
  if (number.startsWith('0')) return number.replace(/^(\d{4})(\d)/, '$1 $2').replace(/^(\d{4} \d{3})(\d)/, '$1 $2');
  if (number.length <= 2) return number;
  const local = number.slice(2);
  const prefixLength = local.startsWith('9') ? 5 : 4;
  const rest = local.length > prefixLength ? `${local.slice(0, prefixLength)}-${local.slice(prefixLength)}` : local;
  return `(${number.slice(0, 2)}) ${rest}`;
}

function parsePhone(raw: string | null) {
  if (!raw) return null;
  if (!/^(?:\+55)?[\d().\s-]+$/.test(raw)) throw new Error('Informe um número brasileiro com DDD.');
  const number = digits(raw.replace(/^\+55\s*/, ''));
  if (!/^(?:[1-9]\d(?:[2-5]\d{7}|9\d{8})|0[3589]00\d{7})$/.test(number)) {
    throw new Error('Informe um número brasileiro válido, com DDD quando aplicável.');
  }
  return number;
}

function parseEmail(email: string | null) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  return email;
}

function parseWebsite(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password) {
      return url.href;
    }
  } catch {
    // The form shows the same validation message for all invalid URLs.
  }
  throw new Error('Informe um site válido, como https://empresa.example.');
}

function field(form: FormData, name: string, label: string, max = 180) {
  const value = form.get(name);
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.includes('\0')) throw new Error(`${label} contém caracteres inválidos.`);
  if (text.length > max) throw new Error(`${label} deve ter até ${max} caracteres.`);
  return text || null;
}

export function parseCompany(form: FormData) {
  const read = (name: CompanyField, max?: number) => field(form, name, companyFields[name], max);
  const legalName = read('legalName');
  const name = read('name')?.replace(/\s+/g, ' ') || legalName;
  if (!name) throw new Error('Informe o nome fantasia ou a razão social.');
  const rawCnpj = read('cnpj', 32);
  const cnpj = rawCnpj ? cnpjKey(rawCnpj) : null;
  if (cnpj && !validCnpj(cnpj)) throw new Error('Informe um CNPJ válido.');
  if (rawCnpj && !cnpj) throw new Error('Informe um CNPJ válido.');
  const rawCep = read('postalCode', 16);
  const postalCode = rawCep ? rawCep.replace(/[\s-]/g, '') : null;
  if (rawCep && (!/^\d{8}$/.test(postalCode ?? '') || postalCode === '00000000')) throw new Error('Informe um CEP válido com 8 dígitos.');
  const state = read('state', 2)?.toUpperCase() ?? null;
  if (state && !brazilianStates.some((uf) => uf === state)) throw new Error('Selecione um estado válido.');
  return {
    name, legalName, cnpj, state, postalCode,
    stateRegistration: read('stateRegistration', 40), segment: read('segment'), size: read('size'),
    responsibleName: read('responsibleName'), responsibleRole: read('responsibleRole'),
    phone: parsePhone(read('phone', 32)), secondaryPhone: parsePhone(read('secondaryPhone', 32)),
    whatsapp: parsePhone(read('whatsapp', 32)), channels: read('channels'),
    email: parseEmail(read('email', 254)), website: parseWebsite(read('website', 512)),
    address: read('address', 300), city: read('city'), source: read('source'),
    notes: read('notes', 4000), active: form.get('status') !== 'inactive',
  };
}

export function parseCommercialContact(form: FormData) {
  const name = field(form, 'name', 'Nome do contato');
  if (!name) throw new Error('Informe o nome do contato.');
  return {
    name, role: field(form, 'role', 'Cargo'),
    phone: parsePhone(field(form, 'phone', 'Telefone', 32)),
    whatsapp: parsePhone(field(form, 'whatsapp', 'WhatsApp', 32)),
    email: parseEmail(field(form, 'email', 'E-mail', 254)),
  };
}

export const postingStates = {
  DRAFT: 'Rascunho', PENDING_APPROVAL: 'Aguardando aprovação',
  PUBLISHED: 'Publicada', INTERNAL: 'Interna', CLOSED: 'Encerrada',
} as const;
