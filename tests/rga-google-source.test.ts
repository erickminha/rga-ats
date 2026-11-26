import { generateKeyPairSync } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { readTalentSheetPage } from '@/server/imports/rga-google-source';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('lê o índice de identidade e apenas uma página completa, preservando as quebras do OCR', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  vi.stubEnv('RGA_TALENT_SHEET_ID', 'identificador-ficticio');
  vi.stubEnv('RGA_GOOGLE_SERVICE_ACCOUNT', JSON.stringify({ client_email: 'sheets@example.invalid', private_key: privateKey }));
  const header = Array<string>(19).fill('');
  header[1] = 'Nome Completo';
  header[9] = 'Upload de Currículo';
  header[17] = 'ID Origem';
  header[18] = 'Texto CV';
  const stamps = Array.from({ length: 110 }, (_, i) => ['carimbo-' + i]);
  const files = stamps.map((_, i) => ['https://drive.google.com/open?id=arquivo-ficticio-' + i]);
  const ids = stamps.map((_, i) => ['origem-' + i]);
  const raw = 'Primeira linha\nSegunda linha';
  const rows = stamps.slice(100).map(([stamp], j) => {
    const i = 100 + j;
    const row = Array<string>(19).fill('');
    row[0] = stamp; row[1] = 'Pessoa fictícia'; row[9] = files[i][0]; row[17] = ids[i][0]; row[18] = raw;
    return row;
  });
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(Response.json({ valueRanges: [[header], stamps, files, ids].map(values => ({ values })) }))
    .mockResolvedValueOnce(Response.json({ values: rows }));
  const page = await readTalentSheetPage(102, 111);
  expect(page.rows).toHaveLength(11);
  expect(page.rows.at(-1)?.[18]).toBe(raw);
  expect(page).toMatchObject({ end: 111, next: 112 });
  expect(new URL(String(fetch.mock.calls[1][0])).searchParams.getAll('ranges').map(range => range.split('!').at(-1))).toEqual(['A1:S1', 'A2:A', 'J2:J', 'R2:R']);
  expect(decodeURIComponent(String(fetch.mock.calls[2][0]))).toContain('!A102:S111');
  expect(fetch).toHaveBeenCalledTimes(3);
});
