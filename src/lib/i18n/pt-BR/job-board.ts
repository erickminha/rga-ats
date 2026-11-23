export const jobBoard = {
  careers: 'Carreiras',
  title: 'Vagas abertas',
  noOpenRoles: 'Nenhuma vaga aberta no momento. Volte em breve.',
  otherRoles: 'Outras vagas',
  team: 'Equipe',
  allTeams: 'Todas as equipes',
  filters: {
    location: 'Localização',
    allLocations: 'Todas as localizações',
    workplace: 'Modalidade de trabalho',
    allWorkplaces: 'Todas as modalidades',
    type: 'Tipo de contratação',
    allTypes: 'Todos os tipos',
  },
  search: 'Buscar vagas abertas',
  searchPlaceholder: 'Buscar vagas, equipes ou localidades…',
  agencySearchPlaceholder: 'Buscar vagas, clientes ou localidades…',
  clear: 'Limpar',
  clearFilters: 'Limpar filtros',
  noMatches: 'Nenhuma vaga encontrada',
  searchHint: 'Tente usar menos palavras ou escolher outros filtros.',
  count: (total: number, shown?: number) =>
    shown === undefined
      ? `${total} ${total === 1 ? 'vaga aberta' : 'vagas abertas'}`
      : `${shown} de ${total} ${total === 1 ? 'vaga' : 'vagas'}`,
  workplace: {
    ONSITE: 'Presencial',
    HYBRID: 'Híbrido',
    REMOTE: 'Remoto',
  } as Record<string, string>,
  commitment: {
    FULL_TIME: 'Tempo integral',
    PART_TIME: 'Meio período',
    CONTRACT: 'Contrato',
    INTERNSHIP: 'Estágio',
  } as Record<string, string>,
} as const;
