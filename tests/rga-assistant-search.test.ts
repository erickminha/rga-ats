import { describe,it,expect } from 'vitest';
import { parseProfileSearch } from '@/lib/assistant-search';
import { operationalIntent } from '@/server/rga-assistant';
describe('Pesquisa por cargo e estado',()=>{
  it('reconhece Amazonas e AM sem tratar UF como cargo',()=>{
    expect(parseProfileSearch('Localize profissionais interessados em vagas de auxiliar administrativo no Amazonas.')).toEqual({roles:['auxiliar','administrativo'],uf:['AM']});
    expect(parseProfileSearch('Auxiliar administrativo AM')).toEqual({roles:['auxiliar','administrativo'],uf:['AM']});
  });
  it('distingue preposição para de UF e nomes compostos',()=>{
    expect(parseProfileSearch('Candidatos para auxiliar')).toEqual({roles:['auxiliar'],uf:[]});
    expect(parseProfileSearch('Auxiliar no Mato Grosso do Sul')).toEqual({roles:['auxiliar'],uf:['MS']});
  });
});


describe('Consultas operacionais sem IA', () => {
  it('reconhece as consultas gerais e não ignora restrições adicionais', () => {
    expect(operationalIntent('Me mostre as vagas abertas')).toBe('open_list');
    expect(operationalIntent('Quantas vagas temos em andamento?')).toBe('open_count');
    expect(operationalIntent('Quantos profissionais estão cadastrados?')).toBe('contacts_count');
    expect(operationalIntent('Liste vagas abertas em Manaus')).toBeNull();
    expect(operationalIntent('Encontre auxiliares de estoque')).toBeNull();
  });
});
