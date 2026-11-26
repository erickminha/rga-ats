const names: Record<string,string> = {
  acre:'AC', alagoas:'AL', amapa:'AP', amazonas:'AM', bahia:'BA', ceara:'CE',
  'distrito federal':'DF', 'espirito santo':'ES', goias:'GO', maranhao:'MA',
  'mato grosso do sul':'MS', 'mato grosso':'MT', minas:'MG', 'minas gerais':'MG',
  para:'PA', paraiba:'PB', parana:'PR', pernambuco:'PE', piaui:'PI',
  'rio de janeiro':'RJ', 'rio grande do norte':'RN', 'rio grande do sul':'RS',
  rondonia:'RO', roraima:'RR', 'santa catarina':'SC', 'sao paulo':'SP', sergipe:'SE', tocantins:'TO',
};
const ignored = new Set('quero preciso procura procurar procure encontrar encontre busca buscar busque localize localizar candidatos candidato candidatas candidata profissionais profissional pessoas pessoa qual quais quem tem tenham possui possuem conhecimento conhecimentos sabem sabe registrada comprovada de em para com sem uma umas uns que dos das nos nas pelo pela sobre mais como muito tenho gostaria interesse interessado interessados vaga vagas oportunidade oportunidades nosso nossa banco talentos talento experiencia experiente perfil perfis trabalho trabalhar trabalhou atua atuou posso'.split(' '));
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function parseProfileSearch(question: string) {
  const clean = question.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|[\d(). -]{7,}/gi,' ');
  let text = fold(clean);
  const uf = new Set<string>();
  // Avoid interpreting preposition "para" as Pará without geographic context.
  for (const name of Object.keys(names).sort((a,b) => b.length-a.length)) {
    const pattern = name === 'para' ? /\b(?:no|estado do|estado de)\s+para\b/g : new RegExp('\\b'+name+'\\b','g');
    if (pattern.test(text)) { uf.add(names[name]); text = text.replace(pattern,' '); }
  }
  // UF must be uppercase in original query or explicitly introduced as a UF/location.
  for (const match of clean.matchAll(/\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g)) {
    uf.add(match[0]); text = text.replace(new RegExp('\\b'+match[0].toLowerCase()+'\\b','g'),' ');
  }
  const roles = [...new Set((text.match(/\bpower\s+bi\b|[a-z0-9]+/g) ?? []).map(term => term.replace(/\s+/g, ' ')))].filter(w => w.length >= 3 && !ignored.has(w) && /[a-z]/.test(w)).slice(0,8);
  return { roles, uf:[...uf] };
}
