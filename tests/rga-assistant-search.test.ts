import { describe,it,expect } from 'vitest';
import { parseProfileSearch } from '@/lib/assistant-search';
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
