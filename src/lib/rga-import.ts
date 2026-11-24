export const RGA_IMPORT_PROVIDER = 'planilha-rga';
export const WORK_SOURCE = 'rga-gestao-de-trabalho';
export const TALENT_SOURCE = 'rga-banco-de-talentos';

export const importKinds = {
  company: 'Empresas',
  posting: 'Vagas',
  candidate: 'Candidatos da Gestão de Trabalho',
  talent: 'Banco de Talentos',
} as const;

export type RgaImportKind = keyof typeof importKinds;
export type Column = [key: string, label: string, alias?: string];

const business: Column[] = [
  ['name', 'Nome fantasia', 'Nome Fantasia'], ['legalName', 'Razão social', 'Nome'],
  ['cnpj', 'CNPJ', 'CNPJ'], ['stateRegistration', 'Inscrição estadual', 'IE'],
  ['segment', 'Segmento', 'Segmento'], ['size', 'Porte', 'Porte'],
  ['responsibleName', 'Contato', 'Contato'], ['responsibleRole', 'Cargo do contato', 'Cargo'],
  ['phone', 'Telefone', 'Telefone'], ['secondaryPhone', 'Telefone 2', 'Telefone 2'],
  ['whatsapp', 'WhatsApp'], ['email', 'E-mail', 'E-mail'], ['website', 'Site', 'Website'],
  ['channels', 'Canais de contato', 'Canais'], ['postalCode', 'CEP', 'CEP'],
  ['address', 'Endereço', 'Endereço'], ['city', 'Cidade', 'Cidade'], ['state', 'Estado', 'Estado'],
  ['notes', 'Observações internas', 'Observações'], ['source', 'Origem', 'Origem'],
  ['status', 'Situação', 'Status'], ['createdAt', 'Data de cadastro', 'Data Cadastro'],
  ['externalId', 'ID de origem'],
];

const talent: Column[] = [
  ['name', 'Nome completo', 'Nome Completo'], ['email', 'E-mail', 'E-mail'],
  ['phone', 'Telefone', 'Telefone (com DDD)'], ['externalId', 'ID de origem', 'ID Origem'],
  ['interest', 'Cargo de interesse', 'Cargo de Interesse'], ['experience', 'Experiência'],
  ['otherInterest', 'Outro cargo', 'Outro cargo não especificado anteriormente'],
  ['city', 'Cidade', 'Cidade'], ['state', 'Estado', 'Estado'], ['district', 'Bairro', 'Bairro'],
  ['salary', 'Pretensão salarial', 'Pretensão Salarial'], ['createdAt', 'Data de origem', 'Carimbo de data/hora'],
  ['notes', 'Observações', 'Obs:'], ['source', 'Origem', 'Origem'], ['status', 'Situação na origem', 'Status'],
  ['postingRef', 'ID de origem da vaga'],
];

const candidateAliases: Record<string, string> = {
  name: 'Nome', phone: 'Telefone', interest: 'Cargo', createdAt: 'Data Seleção', notes: 'Observação', district: 'Bairro',
};

export const columnsByKind: Record<RgaImportKind, Column[]> = {
  company: business,
  posting: [
    ['externalId', 'ID de origem da vaga'], ['title', 'Título da vaga'], ['description', 'Descrição'],
    ['location', 'Localidade'], ['workplace', 'Modalidade'], ['commitment', 'Tipo de contratação'],
    ['clientRef', 'ID de origem da empresa'], ['clientCnpj', 'CNPJ da empresa'], ['clientName', 'Nome da empresa'],
    ['salaryMin', 'Salário mínimo'], ['salaryMax', 'Salário máximo'], ['createdAt', 'Data de origem'],
  ],
  talent,
  candidate: [
    ...talent.map(([key, label]) => [key, label, candidateAliases[key]] satisfies Column),
    ['selectionId', 'ID único de origem da seleção'],
    ['companyName', 'Empresa informada na origem', 'Empresa'],
    ['interview', 'Indicação de entrevista na origem', 'Entrevista marcada'],
    ['interviewDate', 'Data da entrevista na origem', 'Data Entrevista'],
    ['hired', 'Indicação de admissão na origem', 'Candidato Admitido'],
    ['feedbackSent', 'Indicação de envio de parecer na origem', 'ENVIO DE PARECER'],
  ],
};

export type RgaImportReport = {
  total: number;
  created: number;
  updated: number;
  duplicates: number;
  errors: number;
  issues: { row: number; message: string }[];
};

export const headerKey = (header: string) => header.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function mappingSuggestion(kind: RgaImportKind, headers: string[]) {
  return Object.fromEntries(columnsByKind[kind].flatMap(([key, , alias]) => {
    const matches = headers.flatMap((header, idx) => alias && headerKey(header) === headerKey(alias) ? [idx] : []);
    return matches.length === 1 ? [[key, String(matches[0])]] : [];
  }));
}
