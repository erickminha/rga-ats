import { createSign } from 'node:crypto';
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

export async function readTalentSheet(): Promise<string[][]> {
  const id = process.env.RGA_TALENT_SHEET_ID;
  if (!id || !/^[a-zA-Z0-9_-]{10,180}$/.test(id)) throw new Error('Planilha de talentos não configurada.');
  const token = await readGoogleToken(sheetScope);
  const range = encodeURIComponent("'Respostas ao formulário 1'!A:S");
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + range, {
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
  const rows: string[][] = JSON.parse(Buffer.concat(chunks).toString('utf8')).values;
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000 ||
      rows.some(row => !Array.isArray(row) || row.length > 19 || row.some((cell, i) => typeof cell !== 'string' || cell.length > (rows[0]?.[i] === 'Texto CV' ? 50000 : 12000)))) {
    throw new Error('A origem retornou células incompatíveis.');
  }
  const mapping = mappingSuggestion('talent', rows[0]);
  if (mapping.externalId === undefined || mapping.name === undefined) throw new Error('Cabeçalho da planilha incompatível.');
  return rows;
}
