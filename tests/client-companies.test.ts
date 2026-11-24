import { describe, expect, it } from 'vitest';
import { hasDb } from './setup';
import { candidate, createOrg } from './fixtures';
import { db } from '@/lib/db';
import { parseCompany } from '@/lib/client-company';
import {
  clientPostingHistory, getClientCompany, listClientCompanies, saveClientCompany, saveCommercialContact, setPostingClient,
} from '@/server/client-companies';
import { addGroups, removeClientCompany } from '@/server/org';
import { createPosting } from '@/server/postings';

async function agency() {
  const fixture = await createOrg();
  await db.organization.update({ where: { id: fixture.org.id }, data: { kind: 'AGENCY' } });
  return { ...fixture, ctx: { orgId: fixture.org.id, userId: fixture.admin.id, accessRole: 'SUPER_ADMIN' } };
}
function company(name: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [field, value] of Object.entries({ name, ...extra })) form.set(field, value);
  return parseCompany(form);
}
const commercial = { name: 'Contato Fictício', role: 'Compras', phone: null, whatsapp: null, email: 'contato@example.invalid' };

describe.skipIf(!hasDb)('client company management', () => {
  it('creates, edits, lists and filters by name, city, formatted CNPJ, status and segment', async () => {
    const { ctx } = await agency();
    const created = await saveClientCompany(ctx, null, company('Alfa Fictícia', { city: 'Recife', segment: 'Serviços', cnpj: '12.ABC.345/01DE-35' }));
    expect(created.createdAt).toBeInstanceOf(Date);
    await saveClientCompany(ctx, null, company('Beta Fictícia', { status: 'inactive', segment: 'Comércio' }));
    for (const q of ['alfa', 'RECIFE', '12.ABC.345/01DE-35']) {
      expect((await listClientCompanies(ctx, { q })).rows.map(({ id }) => id)).toEqual([created.id]);
    }
    expect((await listClientCompanies(ctx, { status: 'inactive', segment: 'Comércio' })).total).toBe(1);
    expect((await listClientCompanies(ctx, { status: 'active', segment: 'Comércio' })).total).toBe(0);
    const updated = await saveClientCompany(ctx, created.id, company('Alfa Atualizada'));
    expect(updated).toMatchObject({ id: created.id, name: 'Alfa Atualizada', createdAt: created.createdAt });
    const contact = await saveCommercialContact(ctx, created.id, null, commercial);
    await saveCommercialContact(ctx, created.id, contact.id, { ...commercial, role: 'RH' });
    expect((await getClientCompany(ctx, created.id))?.commercialContacts).toEqual([expect.objectContaining({ role: 'RH' })]);
    expect(await db.contact.count({ where: { orgId: ctx.orgId } })).toBe(0);
  });

  it('prevents equivalent names and CNPJs, including concurrent bulk creation', async () => {
    const { ctx } = await agency();
    await saveClientCompany(ctx, null, company('Empresa Fíctícia', { legalName: 'Ficção Ltda.', cnpj: '11.222.333/0001-81' }));
    await expect(saveClientCompany(ctx, null, company(' ficcao  ltda. '))).rejects.toThrow(/nome ou razão social/);
    await expect(saveClientCompany(ctx, null, company('Outra Empresa', { cnpj: '11222333000181' }))).rejects.toThrow(/CNPJ/);
    await Promise.allSettled([
      saveClientCompany(ctx, null, company('União Fictícia')),
      addGroups(ctx, 'client', ['uniao ficticia']),
    ]);
    expect(await db.clientCompany.count({ where: { orgId: ctx.orgId } })).toBe(2);
  });

  it('derives posting counts, preserves inactive and previous links and rejects foreign records', async () => {
    const { ctx, stages } = await agency();
    const other = await agency();
    const client = await saveClientCompany(ctx, null, company('Empresa Local'));
    const otherClient = await saveClientCompany(other.ctx, null, company('Empresa Externa'));
    const alt = await saveClientCompany(ctx, null, company('Outro Cliente Local'));
    const posting = await createPosting(ctx, { title: 'Vaga fictícia', clientCompanyId: client.id, workplaceType: 'REMOTE', commitment: 'FULL_TIME' });
    await db.posting.update({ where: { id: posting.id }, data: { state: 'PUBLISHED' } });
    await db.posting.create({ data: { orgId: ctx.orgId, clientCompanyId: client.id, title: 'Vaga encerrada', slug: 'closed', state: 'CLOSED' } });
    await candidate(ctx.orgId, stages, [[0, 0]], { postingId: posting.id });
    expect(await clientPostingHistory(ctx, client.id)).toMatchObject({ open: 1, closed: 1, withActiveProcesses: 1 });
    await expect(setPostingClient(ctx, posting.id, otherClient.id)).rejects.toThrow(/empresa ativa/);
    expect(await getClientCompany(other.ctx, client.id)).toBeNull();
    await expect(saveClientCompany(other.ctx, client.id, company('Intrusa'))).rejects.toThrow(/não encontrada/);
    await expect(saveCommercialContact(other.ctx, client.id, null, commercial)).rejects.toThrow(/não encontrada/);
    await expect(listClientCompanies({ ...ctx, accessRole: 'INTERVIEWER' }, {})).rejects.toThrow(/permissão/);
    await expect(saveClientCompany({ ...ctx, accessRole: 'LIMITED_TEAM_MEMBER' }, client.id, company('Sem acesso'))).rejects.toThrow(/permissão/);
    await removeClientCompany(ctx, client.id);
    await expect(createPosting(ctx, { title: 'Vaga de cliente inativo', clientCompanyId: client.id, workplaceType: 'REMOTE', commitment: 'FULL_TIME' })).rejects.toThrow('Client not found');
    expect(await db.posting.findUnique({ where: { id: posting.id } })).toMatchObject({ clientCompanyId: client.id });
    await setPostingClient(ctx, posting.id, alt.id);
    expect(await clientPostingHistory(ctx, client.id)).toMatchObject({
      closed: 1, previous: [expect.objectContaining({ title: 'Vaga fictícia', subjectId: posting.id })],
    });
    expect(await clientPostingHistory(ctx, alt.id)).toMatchObject({ open: 1, withActiveProcesses: 1 });
  });
});
