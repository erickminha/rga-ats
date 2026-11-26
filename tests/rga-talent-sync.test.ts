import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOrg } from './fixtures';
import { hasDb } from './setup';
import { db } from '@/lib/db';
import { changedTalentRows, syncTalentBatch } from '@/server/imports/rga-talent-sync';
import { readTalentSheet } from '@/server/imports/rga-google-source';
import { POST } from '@/app/api/cron/rga-talentos/route';

vi.mock('@/server/imports/rga-google-source', () => ({ readTalentSheet: vi.fn() }));
const header = ['Nome Completo', 'ID Origem', 'Cidade'];
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('sincronização incremental', () => {
  it('separa todos os IDs repetidos e vazios, limita o lote e permite repetir erros', () => {
    const source = [header, ['A','dup'], ['B','dup'], ['C',''], ...Array.from({ length: 101 }, (_, i) => ['Pessoa fictícia', String(i)])];
    const first = changedTalentRows(source, new Map(), false);
    expect(first).toMatchObject({ unresolved: 3, changed: 101 });
    expect(first.batch).toHaveLength(100);
    const saved = new Map(first.batch.map(item => [item.key, item.fingerprint]));
    const item = first.batch[0];
    saved.set(item.key, 'erro:' + item.fingerprint);
    expect(changedTalentRows(source, saved, false)).toMatchObject({ changed: 1, skippedErrors: 1 });
    expect(changedTalentRows(source, saved, true).changed).toBe(2);
  });

  it('exige credencial de cron e mantém o agendamento desativado por padrão', async () => {
    vi.stubEnv('CRON_SECRET', 'chave-de-teste');
    vi.stubEnv('RGA_TALENT_SYNC_DAILY', '');
    expect((await POST(new Request('http://localhost'))).status).toBe(401);
    expect(await (await POST(new Request('http://localhost', { headers: { authorization: 'Bearer chave-de-teste' } }))).json()).toEqual({ enabled: false });
    expect(readTalentSheet).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasDb)('sincronização com PostgreSQL local', () => {
  it('valida o responsável, confirma a fonte exata, preserva edição local e retoma pelo checkpoint', async () => {
    const { org, admin } = await createOrg();
    vi.stubEnv('AUTH_SECRET', 'chave-local-de-teste');
    vi.stubEnv('RGA_TALENT_SYNC_ORG_ID', org.id);
    const ctx = { userId: admin.id, orgId: org.id, accessRole: 'ADMIN' };
    const rows = [header, ['Talento fictício','origem-1','Manaus']];
    vi.mocked(readTalentSheet).mockResolvedValue(rows);
    await expect(syncTalentBatch({ ...ctx, accessRole: 'TEAM_MEMBER' }, 'preview')).rejects.toThrow();
    await expect(syncTalentBatch({ ...ctx, orgId: 'outra' }, 'preview')).rejects.toThrow();
    expect(readTalentSheet).not.toHaveBeenCalled();
    const first = await syncTalentBatch(ctx, 'preview');
    expect(first.report?.created).toBe(1);
    expect(await db.contact.count({ where: { orgId: org.id } })).toBe(0);
    rows[1][2] = 'Recife';
    await expect(syncTalentBatch(ctx, 'confirm', first.ticket!)).rejects.toThrow(/prévia/);
    const next = await syncTalentBatch(ctx, 'preview');
    await syncTalentBatch(ctx, 'confirm', next.ticket!);
    expect((await syncTalentBatch(ctx, 'scheduled')).changed).toBe(0);
    const person = await db.contact.findFirstOrThrow({ where: { orgId: org.id } });
    await db.contact.update({ where: { id: person.id }, data: { location: 'Local editado no ATS' } });
    rows[1][2] = 'Fortaleza';
    expect((await syncTalentBatch(ctx, 'scheduled')).count).toBe(1);
    expect(await db.contact.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ location: 'Local editado no ATS' });
    expect(await db.contact.count({ where: { orgId: org.id } })).toBe(1);
    expect(await db.consentRecord.count({ where: { orgId: org.id } })).toBe(0);
  });
});

describe.skipIf(!hasDb)('histórico da sincronização operacional', () => {
  it('compartilha o processamento manual e diário e registra uma execução sem mudanças', async () => {
    const { enqueueTalentSync, processTalentSync, requestTalentSync } = await import('@/server/talent-sync-run');
    const { org, admin } = await createOrg();
    vi.stubEnv('AUTH_SECRET', 'chave-local-de-teste');
    vi.stubEnv('RGA_TALENT_SYNC_ORG_ID', org.id);
    vi.stubEnv('RGA_TALENT_SYNC_ADMIN_ID', admin.id);
    vi.stubEnv('RGA_TALENT_SHEET_ID', 'planilha-ficticia-1');
    vi.stubEnv('RGA_GOOGLE_SERVICE_ACCOUNT', 'somente-teste');
    vi.mocked(readTalentSheet).mockResolvedValue([header, ['Pessoa simulada', 'id-operacional', 'Manaus']]);
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const [first, second] = await Promise.all([requestTalentSync(ctx), requestTalentSync(ctx)]);
    expect(first.id).toBe(second.id);
    await Promise.all([processTalentSync(org.id), processTalentSync(org.id)]);
    expect(await db.talentSyncRun.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'SUCCEEDED', rowsRead: 1, createdCount: 1 });
    const daily = await enqueueTalentSync(org.id, 'daily', null);
    await processTalentSync(org.id);
    expect(await db.talentSyncRun.findUniqueOrThrow({ where: { id: daily.id } })).toMatchObject({ status: 'SUCCEEDED', rowsRead: 1, unchanged: 1, createdCount: 0 });
    expect(await db.contact.count({ where: { orgId: org.id } })).toBe(1);
    await expect(requestTalentSync({ ...ctx, accessRole: 'INTERVIEWER' })).rejects.toThrow();
  });
});
