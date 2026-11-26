import { formatPublicSalary, postingContent, publicPostingText } from '@/lib/public-careers';

export const adFieldLabels = { schedule: 'Horário e escala', benefits: 'Benefícios', contract: 'Regime de contratação', openings: 'Quantidade de posições', deadline: 'Prazo de candidatura' } as const;
export type AdFields = Partial<Record<keyof typeof adFieldLabels, string>>;
export function readAdFields(content: unknown): AdFields {
  const ad = postingContent(postingContent(content).advertisement);
  return Object.fromEntries(Object.keys(adFieldLabels).flatMap(key => {
    const value = ad[key];
    return typeof value === 'string' && value.trim() ? [[key, value.trim().slice(0, 1000)]] : [];
  }));
}
export function adFieldsFromForm(form: FormData): AdFields {
  return Object.fromEntries(Object.keys(adFieldLabels).flatMap(key => {
    const value = String(form.get('ad_' + key) ?? '').trim();
    return value ? [[key, value.slice(0, 1000)]] : [];
  }));
}

const workplace: Record<string, string> = { ONSITE: 'Presencial', HYBRID: 'Híbrida', REMOTE: 'Remota' };
const commitment: Record<string, string> = { FULL_TIME: 'Tempo integral', PART_TIME: 'Meio período', CONTRACT: 'Contrato', INTERNSHIP: 'Estágio' };
export function makeAd(input: { title: string; location: string | null; workplaceType: string; commitment: string; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; content: unknown; publicCompany: string | null; publicUrl: string | null; brand: string }) {
  const data = readAdFields(input.content);
  const { description, requirements } = publicPostingText(input.content);
  const basics = [
    input.publicCompany ? 'Empresa: ' + input.publicCompany : '',
    input.location ? 'Localidade: ' + input.location : '',
    workplace[input.workplaceType] ? 'Modalidade: ' + workplace[input.workplaceType] : '',
    commitment[input.commitment] ? 'Jornada: ' + commitment[input.commitment] : '',
    formatPublicSalary(input.salaryMin, input.salaryMax, input.salaryCurrency) ? 'Remuneração: ' + formatPublicSalary(input.salaryMin, input.salaryMax, input.salaryCurrency) : '',
    ...Object.entries(adFieldLabels).flatMap(([key,label]) => data[key as keyof AdFields] ? [label + ': ' + data[key as keyof AdFields]] : []),
  ].filter(Boolean);
  return [input.brand + ' — Oportunidade de emprego', input.title, basics.join('\n'),
    description ? 'Atividades e informações\n' + description : '',
    requirements.length ? 'Requisitos\n' + requirements.map(x => '• ' + x).join('\n') : '',
    input.publicUrl ? 'Candidate-se: ' + input.publicUrl : 'Prévia interna — publique a vaga para obter o link de candidatura.'
  ].filter(Boolean).join('\n\n');
}

export const messageKinds = {
  contact: 'Primeiro contato', interview: 'Convite para entrevista', reference: 'Referências profissionais',
  referenceIntro: 'Primeiro contato com a referência', referenceReminder: 'Lembrete para a referência', referenceThanks: 'Agradecimento à referência',
  disc: 'Orientações DISC', documents: 'Orientações sobre documentos', followup: 'Retorno de acompanhamento', approved: 'Aprovação comunicada', closed: 'Encerramento da participação',
} as const;
export type MessageKind = keyof typeof messageKinds;
export type WhatsappTemplates = Partial<Record<MessageKind, string>>;

export const whatsappVariables = {
  nome: 'Nome do destinatário', vaga: 'Vaga', organizacao: 'Organização',
  horario: 'Data e horário da entrevista', local: 'Local ou link da entrevista', linkDisc: 'Link individual do DISC',
} as const;
const placeholder = /{{\s*([^{}]+?)\s*}}/g;

export function readWhatsappTemplates(value: unknown): WhatsappTemplates {
  const entries = postingContent(value);
  return Object.fromEntries(Object.keys(messageKinds).flatMap(kind => {
    const text = entries[kind];
    return typeof text === 'string' && text.trim() && text.length <= 2000 ? [[kind, text]] : [];
  }));
}

export function invalidWhatsappVariable(text: string, kind: MessageKind) {
  for (const [, key] of text.matchAll(placeholder)) {
    if (!Object.hasOwn(whatsappVariables, key)
      || (key === 'linkDisc' && kind !== 'disc')
      || ((key === 'horario' || key === 'local') && kind !== 'interview')) return true;
  }
  return /[{}]/.test(text.replace(placeholder, '')) ||
    (kind === 'disc' && ![...text.matchAll(placeholder)].some(([, key]) => key === 'linkDisc'));
}

export function messageFor(kind: MessageKind, input: {
  name: string; job: string; brand: string; appointment?: string; meeting?: string; discUrl?: string;
}, template?: string) {
  if (template) {
    const values: Record<string, string> = {
      nome: input.name, vaga: input.job, organizacao: input.brand,
      horario: input.appointment ?? '', local: input.meeting ?? '', linkDisc: input.discUrl ?? '',
    };
    return template.replace(placeholder, (_, key: string) => values[key] ?? '');
  }
  const greeting = 'Olá, ' + input.name + '! Aqui é da ' + input.brand + '.';
  const job = input.job;
  const end = '\n\nAtenciosamente,\n' + input.brand;
  const body: Record<MessageKind,string> = {
    contact: 'Estamos conduzindo um processo seletivo para ' + job + '. Você tem interesse e disponibilidade para conversar sobre a oportunidade?',
    interview: 'Gostaríamos de convidar você para uma entrevista referente à vaga de ' + job + '.' + (input.appointment ? '\nData e horário: ' + input.appointment : '\nVamos combinar o melhor horário?') + (input.meeting ? '\nLocal ou link: ' + input.meeting : '') + '\nPor favor, confirme sua disponibilidade.',
    reference: 'Estamos dando continuidade ao seu processo seletivo para a vaga de ' + job + '. Poderia nos encaminhar referências de pessoas que acompanharam diretamente suas atividades? Confirme previamente a disponibilidade dessas pessoas para contato. Agradecemos pela colaboração.',
    referenceIntro: 'Você teria disponibilidade para conversar sobre uma experiência profissional que acompanhou diretamente? Antes de prosseguir, confirmaremos a finalidade e o canal mais adequado.',
    referenceReminder: 'Retomamos nosso contato sobre a referência profissional. Se puder responder, por favor nos indique um horário ou canal adequado.',
    referenceThanks: 'Agradecemos seu retorno e o tempo dedicado a compartilhar informações profissionais.',
    disc: 'Use seu link individual para responder ao questionário DISC da vaga de ' + job + ':\n' + (input.discUrl ?? ''),
    documents: 'Precisamos combinar a próxima etapa de documentação da vaga de ' + job + '. Vamos orientar quais documentos são necessários e o canal seguro para entrega. Por favor, não envie documentos pessoais por esta conversa.',
    followup: 'Estamos acompanhando o processo seletivo para ' + job + '. Entraremos em contato quando houver novidades. Agradecemos sua disponibilidade.',
    approved: 'Temos uma atualização positiva sobre sua participação na vaga de ' + job + '. Você foi aprovado(a) nesta etapa. Vamos alinhar os próximos passos e as condições antes de qualquer início de trabalho.',
    closed: 'Agradecemos sua participação no processo seletivo para ' + job + '. Sua participação foi encerrada nesta oportunidade. Agradecemos o tempo dedicado e desejamos sucesso em sua trajetória.',
  };
  return greeting + '\n\n' + body[kind] + end;
}
export function whatsappPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return '55' + digits;
  return null;
}

export function approvedForMessage(status: string, clientId: string | null | undefined, history: unknown) {
  if (status === 'HIRED') return true;
  if (status !== 'ACTIVE' || !clientId || !Array.isArray(history)) return false;
  const latest = history.findLast(item => item && typeof item === 'object' && !Array.isArray(item) && item.clientId === clientId);
  return !!latest && typeof latest === 'object' && !Array.isArray(latest) && latest.status === 'APPROVED' && latest.clientId === clientId;
}

export function registeredSourceCounts(rows: { source: string | null; _count: number }[]) {
  const counts = new Map<string, number>();
  for (const { source, _count } of rows) {
    const saved = source?.trim();
    const label = !saved ? 'Origem desconhecida' : saved === 'careers site' ? 'Portal de vagas' : saved;
    counts.set(label, (counts.get(label) ?? 0) + _count);
  }
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}
