export const organization = {
  kinds: {
    COMPANY: { title: 'Empresa', description: 'Recrutamos para nossas próprias equipes e departamentos.' },
    AGENCY: { title: 'Agência de recrutamento', description: 'Recrutamos para diversas empresas clientes.' },
  },
  client: {
    singular: 'Cliente',
    plural: 'Empresas clientes',
    all: 'Todos os clientes',
    other: 'Outros clientes',
    none: 'Sem cliente',
    example: 'Empresa Exemplo',
  },
  department: {
    singular: 'Departamento',
    plural: 'Departamentos',
    none: 'Sem departamento',
    example: 'Engenharia',
  },
  signup: {
    agencyTitle: 'Crie o espaço de trabalho da sua agência',
    agencyDescription: 'Sua agência começa com um funil de recrutamento padrão para atender às empresas clientes. Você terá acesso de administrador principal.',
    agencyName: 'Nome da agência',
    agencyExample: 'Agência Exemplo',
    companyName: 'Nome da organização',
    companyExample: 'Empresa Exemplo',
  },
} as const;

export const groups = {
  add: 'Adicionar',
  upload: 'Enviar planilha',
  undo: 'Desfazer',
  hint: 'Para adicionar vários nomes, separe-os por vírgulas, cole uma coluna da planilha ou envie um arquivo CSV ou Excel.',
  added: (count: number, noun: string, filename?: string) =>
    `${count} ${noun} ${count === 1 ? 'adicionado' : 'adicionados'}${filename ? ` de ${filename}` : ''}`,
  existing: (count: number) => `${count} ${count === 1 ? 'já estava na lista' : 'já estavam na lista'}`,
  removed: (count: number, noun: string) => `${count} ${noun} ${count === 1 ? 'removido' : 'removidos'}`,
  remove: (name: string) => `Remover ${name}`,
  confirmRemove: (name: string) => `Remover ${name}? As vagas continuam disponíveis e deixam de aparecer neste grupo.`,
  missingName: 'Digite um nome.',
  missingFile: 'Selecione um arquivo para enviar.',
  fileTooLarge: 'O arquivo excede 5 MB.',
  unreadableFile: 'Não foi possível ler o arquivo. Envie um CSV ou um arquivo do Excel (.xlsx).',
  missingNames: 'Nenhum nome encontrado. Use a primeira coluna ou o cabeçalho “Empresa”.',
} as const;

export const logo = {
  uploading: 'Enviando…',
  replace: (label: string) => `Trocar ${label}`,
  upload: (label: string) => `Enviar ${label}`,
  remove: (label: string) => `Remover ${label}`,
  invalidType: 'Envie um logotipo em PNG, JPEG, SVG ou WebP.',
  fileTooLarge: 'O logotipo deve ter menos de 1 MB.',
} as const;
