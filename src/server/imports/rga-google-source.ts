import { createHash, createSign } from 'node:crypto';
import { mappingSuggestion } from '@/lib/rga-import';

const sheetScope = 'https://www.googleapis.com/auth/spreadsheets.readonly' as const;
const tokenUrl = 'https://oauth2.googleapis.com/token';

export async function readGoogleToken(scope: typeof sheetScope | 'https://www.googleapis.com/auth/drive.readonly') {
  const secret = process.env.RGA_GOOGLE_SERVICE_ACCOUNT;
  if (!secret) throw new Error('Credencial de leitura não configurada.');
  const account = JSON.parse(secret) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const claims = { iss: account.client_email, scope, aud: tokenUrl, iat: now, exp: now + 3600 };
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode(claims);
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await fetch(tokenUrl, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }) });
  if (!response.ok) throw new Error('A conta de leitura não conseguiu autenticar.');
  const token = (await response.json()).access_token;
  if (typeof token !== 'string' || !token) throw new Error('Resposta de autenticação inválida.');
  return token;
}

const tab = "'Respostas ao formulário 1'";

async function sheetValues(token: string, suffix: string) {
  const id = process.env.RGA_TALENT_SHEET_ID;
  if (!id || !/^[a-zA-Z0-9_-]{10,180}$/.test(id)) throw new Error('Planilha de talentos não configurada.');
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values' + suffix, {
    headers: { Authorization: 'Bearer ' + token }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
  });
  if (!response.ok || !response.body) throw new Error('Não foi possível ler a aba do banco de talentos.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('A origem excede o limite de leitura.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readRange(token: string, range: string): Promise<string[][]> {
  const { values = [] } = await sheetValues(token, '/' + encodeURIComponent(tab + '!' + range));
  if (!Array.isArray(values) || values.some(row => !Array.isArray(row) || row.length > 19 ||
    row.some(cell => typeof cell !== 'string'))) throw new Error('A origem retornou células incompatíveis.');
  return values;
}

export async function readTalentSheet(): Promise<string[][]> {
  // Drive reconciliation needs only the identity columns, never the OCR.
  return (await readTalentIndex(await readGoogleToken(sheetScope))).rows;
}

async function readTalentIndex(token: string) {
  const params = new URLSearchParams();
  for (const range of ['A1:S1', 'A2:A', 'J2:J', 'R2:R']) params.append('ranges', tab + '!' + range);
  const { valueRanges } = await sheetValues(token, ':batchGet?' + params);
  if (!Array.isArray(valueRanges) || valueRanges.length !== 4) throw new Error('Índice da planilha incompatível.');
  const [[header], stamps, files, origins] = valueRanges.map(range => range.values ?? []);
  if (!Array.isArray(header) || header[9] !== 'Upload de Currículo' || header[17] !== 'ID Origem' ||
      header.lastIndexOf(header[9]) !== 9 || header.lastIndexOf(header[17]) !== 17 ||
      mappingSuggestion('talent', header).name === undefined) throw new Error('Cabeçalho da planilha incompatível.');
  const rows: string[][] = [header];
  const end = Math.max(stamps.length, files.length, origins.length);
  for (let i = 0; i < end; i++) {
    const [stamp, file, origin] = [stamps, files, origins].map(column => column[i]?.[0] ?? '');
    if ([stamp, file, origin].some(value => typeof value !== 'string')) throw new Error('Índice da planilha incompatível.');
    const row = Array<string>(19).fill('');
    row[0] = stamp; row[9] = file; row[17] = origin;
    rows.push(row);
  }
  return { rows };
}

export async function readTalentSheetPage(start: number, fixedEnd?: number) {
  const token = await readGoogleToken(sheetScope);
  const { rows: index } = await readTalentIndex(token);
  const end = fixedEnd ?? index.length;
  const size = 100;
  const last = Math.min(start + size - 1, end);
  const header = index[0];
  const values = last < start ? [] : await readRange(token, 'A' + start + ':S' + last);
  const rows = [header];
  for (let i = start; i <= last; i++) {
    const row = values[i - start] ?? [];
    const identity = index[i - 1];
    if (!identity || [0, 9, 17].some(column => (row[column] ?? '') !== identity[column])) {
      throw new Error('As linhas mudaram durante a leitura.');
    }
    rows.push(row);
  }
  const sourceHash = createHash('sha256').update(JSON.stringify(index.slice(0, end))).digest('hex');
  return { index, rows, end, sourceHash, next: last + 1 };
}

export async function readTalentSheetForImport() {
  // The legacy admin preview needs the complete input to calculate its total and seal the batch.
  const token = await readGoogleToken(sheetScope);
  const { rows: index } = await readTalentIndex(token);
  const rows = [index[0]];
  for (let start = 2; start <= index.length; start += 100) {
    const last = Math.min(start + 99, index.length);
    const values = await readRange(token, 'A' + start + ':S' + last);
    for (let i = start; i <= last; i++) {
      const row = values[i - start] ?? [];
      if ([0, 9, 17].some(column => (row[column] ?? '') !== index[i - 1][column])) throw new Error('As linhas mudaram durante a leitura.');
      rows.push(row);
    }
  }
  return rows;
}
