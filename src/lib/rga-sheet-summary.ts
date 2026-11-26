import { readSummaryText } from './talent-summary';

const fields = ['Resumo', 'Cargo recente', 'Cargo pretendido', 'Experiência', 'Histórico profissional', 'Formação', 'Competências', 'Cursos e certificações', 'Idiomas', 'Localização'] as const;
const sensitive = /@|https?:|(?:\d[\s().-]*){8}|\b(?:cpf|rg|cep|endereço residencial|data de nascimento|estado civil|apto para|inapto para|recomendo a contratação)\b/i;
const clean = (value: string) => value.trim() === 'Não informado' ? '' : value.trim();
const list = (value: string) => clean(value).split(/[,;\n]/).map(v => v.trim()).filter(Boolean).slice(0, 30);

export function parseSheetSummary(value: string) {
  const text = value.trim().replace(/\r\n/g, '\n');
  if (!text || text.length > 12000 || /^ERRO:/i.test(text) || sensitive.test(text)) return null;
  const parts: Record<string, string> = {};
  let current = '';
  for (const line of text.split('\n')) {
    const label = fields.find(key => line.startsWith(key + ':'));
    if (label) {
      if (Object.hasOwn(parts, label)) return null;
      current = label;
      parts[label] = line.slice(label.length + 1).trim();
    } else if (current) parts[current] += '\n' + line;
    else return null;
  }
  if (fields.some(key => !Object.hasOwn(parts, key))) return null;
  const headline = readSummaryText({ summary: parts.Resumo });
  if (!headline || headline === 'Não informado') return null;
  const history = clean(parts['Histórico profissional']).split('\n').map(line => line.replace(/^-\s*/, '').trim()).filter(Boolean);
  const recent = clean(parts['Cargo recente']);
  const yearsText = clean(parts['Experiência']).match(/^(\d{1,2})(?:[.,](\d{1,2}))?\s+anos?(?: completos?)?(?:[.,]|\s|$)/i);
  const years = yearsText ? Number(yearsText[1] + (yearsText[2] ? '.' + yearsText[2] : '')) : null;
  return { headline, text, content: {
    sheetText: text, recent, experience: [...new Set([recent, ...history].filter(Boolean))],
    education: clean(parts['Formação']) ? [clean(parts['Formação'])] : [],
    skills: list(parts['Competências']), courses: list(parts['Cursos e certificações']),
    interest: clean(parts['Cargo pretendido']) ? [clean(parts['Cargo pretendido'])] : [],
    languages: list(parts['Idiomas']), location: clean(parts['Localização']), years,
  } };
}

export function sheetResumeFileId(value: string) {
  const m = value.trim().match(/^https:\/\/drive\.google\.com\/(?:file\/d\/([-\w]{10,180})(?:\/view)?\/?(?:\?[^\s#]*)?(?:#[^\s]*)?|open\?id=([-\w]{10,180})(?:&[^\s#]*)?)$/i)
    ?? value.trim().match(/^https:\/\/docs\.google\.com\/document\/d\/([-\w]{10,180})(?:\/(?:edit|view|preview))?\/?(?:\?[^\s#]*)?(?:#[^\s]*)?$/i);
  return m?.[1] || m?.[2] || '';
}

export function sheetSummaryRows(rows: string[][]) {
  const head = rows[0] ?? [];
  const col = (name: string) => head.indexOf(name) === head.lastIndexOf(name) ? head.indexOf(name) : -1;
  const s = col('ResumoCurriculo'), o = col('ID Origem'), f = col('Upload de Currículo');
  if (s < 0 || o < 0 || f < 0) return [];
  const data = rows.slice(1).map(row => ({ origin: (row[o] ?? '').trim(), file: sheetResumeFileId(row[f] ?? ''), raw: row[s] ?? '' }));
  const counts = (values: string[]) => { const map = new Map<string, number>(); for (const v of values) if (v) map.set(v, (map.get(v) ?? 0) + 1); return map; };
  const ids = counts(data.map(row => row.origin)), files = counts(data.map(row => row.file));
  return data.flatMap(row => {
    if (!row.file || files.get(row.file) !== 1 || (row.origin && (row.origin.length > 180 || ids.get(row.origin) !== 1))) return [];
    const summary = parseSheetSummary(row.raw);
    return summary ? [{ origin: row.origin, file: row.file, ...summary }] : [];
  });
}


export function explicitTalentConsent(value: string) {
  return value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '') === 'li as informacoes acima e concordo';
}

export function prepareTalentRows(rows: string[][], known: { origin: string; file: string }[], newId: (file: string) => string) {
  const header = rows[0] ?? [];
  const unique = (name: string) => header.indexOf(name) === header.lastIndexOf(name) ? header.indexOf(name) : -1;
  const originCol = unique('ID Origem'), fileCol = unique('Upload de Currículo');
  const acceptCols = header.flatMap((h, i) => h.startsWith('Ao enviar este formulário, autorizo a RGA Consultoria de RH') ? [i] : []);
  if (originCol < 0 || fileCol < 0 || acceptCols.length !== 1) return rows;
  const files = rows.slice(1).map(row => sheetResumeFileId(row[fileCol] ?? ''));
  const counts = new Map<string, number>();
  for (const file of files) if (file) counts.set(file, (counts.get(file) ?? 0) + 1);
  const lookup = new Map<string, string[]>();
  for (const ref of known) if (ref.file) lookup.set(ref.file, [...(lookup.get(ref.file) ?? []), ref.origin]);
  return [header, ...rows.slice(1).map((row, i) => {
    if ((row[originCol] ?? '').trim() || !explicitTalentConsent(row[acceptCols[0]] ?? '')) return row;
    const file = files[i];
    if (!file || counts.get(file) !== 1) return row;
    const refs = lookup.get(file) ?? [];
    if (refs.length > 1) return row;
    const copy = [...row];
    while (copy.length <= originCol) copy.push('');
    copy[originCol] = refs[0] ?? newId(file);
    return copy;
  })];
}
