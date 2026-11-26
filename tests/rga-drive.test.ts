import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER, TALENT_SOURCE } from '@/lib/rga-import';
import { confirmDriveResume, driveBatch, driveFileId, linkedResume, originalResumeUrl, previewDriveResume } from '@/server/imports/rga-drive';
import { readTalentSheet } from '@/server/imports/rga-google-source';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

vi.mock('@/server/imports/rga-google-source', () => ({ readGoogleToken: async () => 'local-teste', readTalentSheet: vi.fn() }));
const fileId = 'ArquivoFicticio123';
const folder = 'PastaFicticia123';
const url = 'https://drive.google.com/open?id=' + fileId;
const header = ['ID Origem','Upload de Currículo'];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('aceita apenas um arquivo Drive com um único vínculo na origem', () => {
  expect(driveFileId(url)).toBe(fileId);
  expect(driveFileId('https://drive.google.com/file/d/' + fileId + '/view')).toBe(fileId);
  expect(driveFileId('https://drive.google.com.example.org/open?id=' + fileId)).toBeNull();
  expect(linkedResume([header,['A',url],['B',url]],'A')).toBeNull();
  expect(linkedResume([header,['A',url],['A',url]],'A')).toBeNull();
  expect(linkedResume([header,['A',url]],'A')).toBe(fileId);
});

describe.skipIf(!hasDb)('transferência privada por ID de origem', () => {
  it('revalida a pasta e o consentimento, vincula o original uma vez e preserva a versão principal', async () => {
    const { org, admin } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'ADMIN' };
    vi.stubEnv('AUTH_SECRET', 'teste-ficticio'); vi.stubEnv('RGA_TALENT_SYNC_ORG_ID', org.id); vi.stubEnv('RGA_RESUME_FOLDER_ID', folder);
    const person = await db.contact.create({ data: { orgId: org.id, name: 'Pessoa fictícia', emails: [], phones: [], tags: [] } });
    const ref = await db.importRef.create({ data: { orgId: org.id, provider: RGA_IMPORT_PROVIDER, kind: 'contact',
      externalId: TALENT_SOURCE + ':id:A', internalId: person.id } });
    vi.mocked(readTalentSheet).mockResolvedValue([header,['A',url]]);
    const pdf = await PDFDocument.create(); pdf.addPage().drawText('Curriculo ficticio');
    let bytes = Buffer.from(await pdf.save());
    let parent = folder;
    let revision = '1';
    vi.stubGlobal('fetch', vi.fn(async (endpoint: string) => endpoint.includes('alt=media') ? new Response(new Uint8Array(bytes)) :
      Response.json({ id: fileId, parents: [parent], version: revision, trashed: false, size: String(bytes.length), md5Checksum: createHash('md5').update(bytes).digest('hex') })));
    await expect(previewDriveResume(ctx, person.id)).rejects.toThrow('PRIVACY');
    await expect(previewDriveResume({ ...ctx, accessRole: 'INTERVIEWER' }, person.id)).rejects.toThrow('FORBIDDEN');
    await expect(previewDriveResume({ ...ctx, accessRole: 'TEAM_MEMBER' }, person.id)).rejects.toThrow('PRIVACY');
    const consent = await db.consentRecord.create({ data: { orgId: org.id, contactId: person.id, purpose: 'PROFILE_STORAGE' } });
    vi.stubEnv('RGA_TALENT_SHEET_ID', 'PlanilhaFicticia123');
    vi.stubEnv('RGA_GOOGLE_SERVICE_ACCOUNT', 'configuração simulada');
    const recruiter = { ...ctx, accessRole: 'TEAM_MEMBER' };
    await expect(originalResumeUrl(recruiter, person.id)).resolves.toBe(url);
    await expect(originalResumeUrl({ ...ctx, accessRole: 'INTERVIEWER' }, person.id)).rejects.toThrow('FORBIDDEN');
    await expect(originalResumeUrl({ ...ctx, orgId: 'outra-organizacao' }, person.id)).rejects.toThrow('PRIVACY');
    vi.stubEnv('RGA_GOOGLE_SERVICE_ACCOUNT', '');
    await expect(originalResumeUrl(recruiter, person.id)).rejects.toThrow('CONFIG');
    await db.importRef.update({ where: { id: ref.id }, data: { snapshot: { resumeDriveFileId: fileId } } });
    vi.mocked(readTalentSheet).mockClear();
    await expect(originalResumeUrl(recruiter, person.id)).resolves.toBe(url);
    expect(readTalentSheet).not.toHaveBeenCalled();
    await expect(driveBatch(recruiter)).rejects.toThrow('FORBIDDEN');
    await expect(previewDriveResume(recruiter, person.id)).resolves.toHaveProperty('ticket');
    const p = await previewDriveResume(ctx, person.id);
    parent = 'PastaDiferente'; await expect(confirmDriveResume(ctx,person.id,p.ticket)).rejects.toThrow('FILE'); parent = folder;
    expect(await confirmDriveResume(ctx, person.id, p.ticket)).toBe(true);
    expect(await confirmDriveResume(ctx, person.id, p.ticket)).toBe(false);
    const original = (await db.contact.findUniqueOrThrow({ where: { id: person.id } })).resumeFileId;
    expect(original).toBeTruthy();
    pdf.addPage().drawText('Nova versao'); bytes = Buffer.from(await pdf.save()); revision = '2';
    await expect(confirmDriveResume(ctx, person.id, p.ticket)).rejects.toThrow('STALE');
    const updated = await previewDriveResume(ctx, person.id);
    expect(await confirmDriveResume(ctx, person.id, updated.ticket)).toBe(true);
    expect((await db.contact.findUniqueOrThrow({ where: { id: person.id } })).resumeFileId).toBe(original);
    expect(await db.storedFile.count({ where: { orgId: org.id, contactId: person.id, resumeVersion: true } })).toBe(2);
    const batch = await driveBatch(ctx);
    expect(batch).toMatchObject({ pending: 1, errors: 0, copied: 0 });
    expect(batch.tickets).toHaveLength(1);
    expect(await driveBatch(ctx, batch.tickets)).toMatchObject({ unchanged: 1, copied: 0, errors: 0 });
    expect(await driveBatch(ctx)).toMatchObject({ pending: 0, tickets: [] });
    await db.consentRecord.update({ where: { id: consent.id }, data: { withdrawnAt: new Date() } });
    await expect(confirmDriveResume(ctx, person.id, updated.ticket)).rejects.toThrow('PRIVACY');
    await expect(originalResumeUrl(recruiter, person.id)).rejects.toThrow('PRIVACY');
  });
});
