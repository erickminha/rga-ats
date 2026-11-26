import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSheetSummary, prepareTalentRows, sheetCvRows, sheetSummaryRows } from '@/lib/rga-sheet-summary';
import { syncSheetSummaries } from '@/server/imports/rga-sheet-summary';
import { db } from '@/lib/db';
import { getTalentCvText, getTalentSummary, requestTalentSummary, reviewTalentSummary } from '@/server/talent-summary';
import { recordTalentPreference } from '@/server/talent-profile';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const file = '1ArquivoFicticioComIdentificador';
const link = 'https://drive.google.com/open?id=' + file;
const header = ['ID Origem', 'Upload de Currículo', 'ResumoCurriculo', 'Ao enviar este formulário, autorizo a RGA Consultoria de RH', 'Carimbo de data/hora'];
const summary = [
  'Resumo: Experiência em rotinas administrativas, relatórios e atendimento ao público.',
  'Cargo recente: Auxiliar Administrativo', 'Cargo pretendido: Analista Administrativo',
  'Experiência: 2 anos completos', 'Histórico profissional:','- Auxiliar Administrativo (2022-2024) — Controle de estoque',
  'Formação: Administração em andamento', 'Competências: Excel, SAP', 'Cursos e certificações: Excel Avançado',
  'Idiomas: Não informado', 'Localização: Manaus/AM',
].join('\n');

afterEach(() => { vi.unstubAllEnvs(); });

it('retém o texto e estrutura completa, distingue cargo pretendido e experiência', () => {
  expect(parseSheetSummary(summary)).toMatchObject({ headline: expect.stringContaining('rotinas administrativas'), content: {
    sheetText: summary, experience: expect.arrayContaining(['Auxiliar Administrativo', 'Auxiliar Administrativo (2022-2024) — Controle de estoque']),
    skills: ['Excel', 'SAP'], interest: ['Analista Administrativo'], years: 2,
  } });
});

it('não importa células vazias, erros, rótulos incompletos ou dados pessoais', () => {
  for (const value of ['', 'ERRO: HTTP_429', 'Resumo: conteúdo incompleto', summary.replace('Excel, SAP', 'CPF 123.456.789-99'), summary.replace('Excel, SAP', 'Contato 11 99999-9999'), summary.replace('Excel, SAP', 'pessoa@example.com')]) expect(parseSheetSummary(value)).toBeNull();
});

it('exclui arquivos ou IDs ambíguos, mesmo quando o duplicado não tem resumo', () => {
  expect(sheetSummaryRows([header, ['id1', link, summary], ['id2', link, '']])).toEqual([]);
  expect(sheetSummaryRows([header, ['id1', link, summary], ['id1', 'https://drive.google.com/open?id=outroArquivoFicticio', '']])).toEqual([]);
  expect(sheetSummaryRows([header, ['id1', link, summary]])).toHaveLength(1);
  expect(sheetSummaryRows([header, ['', link, summary]])).toHaveLength(1);
});

it('preserva ID existente e restaura apenas o vínculo de arquivo único com aceite', () => {
  const accept = 'Li as informações acima e concordo.';
  const row = ['', link, summary, accept, '26/11/2026 10:00:00'];
  expect(prepareTalentRows([header, row], [{ origin: 'historico-1', file }], () => 'novo')[1][0]).toBe('historico-1');
  expect(prepareTalentRows([header, row], [], () => 'novo')[1][0]).toBe('novo');
  expect(prepareTalentRows([header, row], [], () => '')[1][0]).toBe('');
  expect(prepareTalentRows([header, row, row], [], () => 'novo')[1][0]).toBe('');
  expect(prepareTalentRows([header, ['', link, summary, 'Não concordo']], [], () => 'novo')[1][0]).toBe('');
});

it('importa Texto CV integral sem exigir resumo ou excluir contatos do documento', () => {
  const cvHeader = ['ID Origem', 'Upload de Currículo', 'Texto CV'];
  const raw = 'Pessoa Fictícia\nContato: pessoa@example.invalid\nExperiência em SAP';
  expect(sheetCvRows([cvHeader, ['id1', link, raw]])).toEqual([{ origin: 'id1', file, text: raw, cvText: raw }]);
  expect(sheetCvRows([cvHeader, ['id1', link, raw], ['id2', link, '']])).toEqual([]);
  expect(sheetCvRows([cvHeader, ['id1', link, 'ERRO: OCR']])).toEqual([]);
});

describe.skipIf(!hasDb)('importação sem provedor de IA', () => {
  it('é idempotente, conserva revisão, não chama IA e respeita revogação', async () => {
    const { org, admin } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'ADMIN' };
    vi.stubEnv('RGA_TALENT_SYNC_ORG_ID', org.id);
    vi.stubEnv('RGA_SUMMARY_SOURCE', 'sheet');
    const person = await db.contact.create({ data: { orgId: org.id, name: 'Pessoa fictícia' } });
    await db.importRef.create({ data: { orgId: org.id, provider: 'planilha-rga', kind: 'contact',
      externalId: 'rga-banco-de-talentos:id:id1', internalId: person.id, snapshot: { resumeDriveFileId: file } } });
    const source = [header, ['id1', link, summary]];
    expect((await syncSheetSummaries(ctx, source)).imported).toBe(0);
    await recordTalentPreference(ctx, person.id, true);
    expect(await syncSheetSummaries(ctx, source)).toMatchObject({ imported: 1, remaining: 0 });
    expect(await syncSheetSummaries(ctx, source)).toMatchObject({ imported: 0, remaining: 0 });
    expect(await getTalentSummary(ctx, person.id)).toMatchObject({ sourceKind: 'PLANILHA', stale: false, status: 'READY' });
    expect(await requestTalentSummary(ctx, person.id)).toBe(false);
    await reviewTalentSummary(ctx, person.id, 'Experiência conferida pela recrutadora.');
    expect((await syncSheetSummaries(ctx, [header, ['id1', link, summary.replace('SAP', 'Power BI')]])).imported).toBe(1);
    expect(await db.talentSummary.findUniqueOrThrow({ where: { contactId: person.id } })).toMatchObject({ provider: 'sheets', tokens: 0, reviewedText: 'Experiência conferida pela recrutadora.', searchText: expect.stringContaining('Power BI') });
    const cvHeader = ['ID Origem', 'Upload de Currículo', 'Texto CV'];
    const raw = 'Pessoa fictícia\nContato: pessoa@example.invalid\nExperiência em SAP';
    expect((await syncSheetSummaries(ctx, [cvHeader, ['id1', link, raw]])).imported).toBe(1);
    expect((await syncSheetSummaries(ctx, [cvHeader, ['id1', link, raw]])).imported).toBe(0);
    expect(await getTalentCvText(ctx, person.id)).toBe(raw);
    expect(await getTalentSummary(ctx, person.id)).toMatchObject({ reviewedText: 'Experiência conferida pela recrutadora.' });
    expect((await getTalentSummary(ctx, person.id))?.content).not.toHaveProperty('cvText');
    expect((await syncSheetSummaries(ctx, [cvHeader, ['id1', link, 'Falha no OCR: indisponível']])).imported).toBe(0);
    expect(await getTalentCvText(ctx, person.id)).toBe(raw);
    expect((await syncSheetSummaries(ctx, [cvHeader, ['id1', link, raw + '\nCurso de Excel']])).imported).toBe(1);
    expect(await getTalentCvText(ctx, person.id)).toBe(raw + '\nCurso de Excel');
    expect(await getTalentCvText({ ...ctx, orgId: 'outra' }, person.id)).toBeNull();
    expect((await db.talentSummary.findUniqueOrThrow({ where: { contactId: person.id } })).searchText).not.toContain('pessoa@example.invalid');
    await recordTalentPreference(ctx, person.id, false);
    expect((await syncSheetSummaries(ctx, source)).imported).toBe(0);
    expect(await db.talentSummary.count({ where: { contactId: person.id } })).toBe(0);
    expect(await db.talentCvText.count({ where: { contactId: person.id } })).toBe(0);
    expect((await syncSheetSummaries(ctx, [cvHeader, ['id1', link, raw]])).imported).toBe(0);
  });
});
