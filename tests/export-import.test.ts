import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { hasDb } from './setup';
import { candidate, createOrg } from './fixtures';
import { db } from '@/lib/db';
import { clientPostingHistory, setPostingClient } from '@/server/client-companies';

const auth = vi.hoisted(() => ({ session: null as null | { user: { orgId: string; accessRole: string } } }));
vi.mock('@/lib/auth', () => ({ auth: async () => auth.session }));

const { GET } = await import('@/app/api/export/route');

function restoreOrg(text: string, slug: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-export-'));
  try {
    const file = path.join(directory, 'export.json');
    writeFileSync(file, text);
    execFileSync(process.execPath, ['scripts/import-org.mjs', file, '--slug', slug], {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DIRECT_URL: process.env.TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function counts(orgId: string) {
  const [contacts, opportunities, transitions, interviews, panel, notes, events] = await Promise.all([
    db.contact.count({ where: { orgId } }),
    db.opportunity.count({ where: { orgId } }),
    db.stageTransition.count({ where: { opportunity: { orgId } } }),
    db.interview.count({ where: { orgId } }),
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "_InterviewPanelists" p JOIN "Interview" i ON i.id = p."A" WHERE i."orgId" = ${orgId}`,
    db.note.count({ where: { orgId } }),
    db.event.count({ where: { orgId } }),
  ]);
  return { contacts, opportunities, transitions, interviews, panel: panel[0].n, notes, events };
}

describe.skipIf(!hasDb)('org export → import-org round trip', () => {
  let orgId = '';

  beforeAll(async () => {
    const { org, stages, admin } = await createOrg();
    orgId = org.id;
    // More rows than one export batch (1,000), so paging is exercised.
    for (let i = 0; i < 1_100; i++) {
      await db.contact.create({ data: { orgId, name: `Contact ${i}`, emails: [`c${i}@x.com`], resumeText: `resume ${i}` } });
    }
    const { opportunity } = await candidate(orgId, stages, [[0, 0], [1, 2]], { name: 'Piped' });
    await db.interview.create({
      data: { orgId, opportunityId: opportunity.id, title: 'Screen', startAt: new Date(), panelists: { connect: [{ id: admin.id }] } },
    });
    await db.note.create({ data: { orgId, opportunityId: opportunity.id, authorId: admin.id, body: 'Strong "yes", with commas' } });
    await db.event.create({ data: { orgId, actorType: 'system', verb: 'org.created', subjectType: 'organization', subjectId: orgId } });
    await db.importRef.createMany({
      data: [
        { orgId, provider: 'lever', kind: 'opportunity', externalId: 'opp-1', internalId: opportunity.id },
        { orgId, provider: 'lever', kind: 'contact', externalId: 'erased-1', internalId: 'deleted-contact-id' },
      ],
    });
  });

  it('refuses non-admins', async () => {
    auth.session = { user: { orgId, accessRole: 'TEAM_MEMBER' } };
    expect((await GET()).status).toBe(403);
  });

  it('streams a complete export that imports into an identical org', async () => {
    auth.session = { user: { orgId, accessRole: 'SUPER_ADMIN' } };
    const response = await GET();
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="source-export-/);
    const text = await response.text();
    const dump = JSON.parse(text);
    expect(dump.exportVersion).toBe(3);
    expect(dump.contacts).toHaveLength(1_101);

    const slug = `copy-${randomUUID()}`;
    restoreOrg(text, slug);

    const copy = await db.organization.findUniqueOrThrow({ where: { slug } });
    expect(await counts(copy.id)).toEqual(await counts(orgId));
    const note = await db.note.findFirstOrThrow({ where: { orgId: copy.id } });
    expect(note.body).toBe('Strong "yes", with commas');
    // Import refs follow their records to the new ids; a tombstone stays one.
    const refs = await db.importRef.findMany({ where: { orgId: copy.id }, orderBy: { externalId: 'asc' } });
    const copiedOpp = await db.opportunity.findFirstOrThrow({ where: { orgId: copy.id, contact: { name: 'Piped' } } });
    expect(refs.map((r) => r.externalId)).toEqual(['erased-1', 'opp-1']);
    expect(refs[1].internalId).toBe(copiedOpp.id);
    expect(refs[0].internalId).not.toBe('deleted-contact-id');
  });

  it('exports one consistent snapshot even while the org is being written to', async () => {
    auth.session = { user: { orgId, accessRole: 'SUPER_ADMIN' } };
    const reader = (await GET()).body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    // Read until the contacts collection is finished, then write a new
    // candidate whose contact id sorts before everything already exported.
    while (!text.includes('"postings":[')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    const stages = await db.stage.findMany({ where: { orgId }, orderBy: { order: 'asc' } });
    const late = await db.contact.create({
      data: { id: '00000000-0000-4000-8000-000000000000', orgId, name: 'Arrived mid-export' },
    });
    await db.opportunity.create({ data: { orgId, contactId: late.id, stageId: stages[0].id } });
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    const dump = JSON.parse(text);
    const contactIds = new Set(dump.contacts.map((c: { id: string }) => c.id));
    const dangling = dump.opportunities.filter((o: { contactId: string }) => !contactIds.has(o.contactId));
    expect(dangling).toEqual([]);
  });
});

describe.skipIf(!hasDb)('client company export → restore', () => {
  let sourceOrgId: string;
  let sourceCompany: Awaited<ReturnType<typeof db.clientCompany.create>>;
  let formerCompanyId: string;
  let sourceContact: Awaited<ReturnType<typeof db.clientCompanyContact.create>>;
  let sourcePostingId: string;
  let foreignOrgId: string;
  let foreignCompanyId: string;
  let exportText: string;

  beforeAll(async () => {
    const { org, admin } = await createOrg();
    sourceOrgId = org.id;
    await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY' } });
    const { org: foreignOrg } = await createOrg();
    foreignOrgId = foreignOrg.id;
    const foreignCompany = await db.clientCompany.create({ data: { orgId: foreignOrgId, name: 'Outra organização' } });
    foreignCompanyId = foreignCompany.id;
    await db.clientCompanyContact.create({ data: { clientCompanyId: foreignCompanyId, name: 'Contato externo' } });

    const former = await db.clientCompany.create({ data: { orgId: org.id, name: 'Cliente anterior', createdAt: null } });
    formerCompanyId = former.id;
    const current = await db.clientCompany.create({
      data: {
        orgId: org.id, name: 'Empresa Fictícia', legalName: 'Empresa Fictícia Ltda.',
        cnpj: '12ABC34501DE35', stateRegistration: '123456', segment: 'Serviços', size: 'Pequena',
        responsibleName: 'Pessoa Fictícia', responsibleRole: 'Compras', phone: '1134567890',
        secondaryPhone: '11912345678', whatsapp: '11987654321', channels: 'Site | Indicação',
        email: 'empresa@example.invalid', website: 'https://empresa.example.invalid/',
        postalCode: '01234567', address: 'Rua Fictícia, 10', city: 'São Paulo', state: 'SP',
        notes: 'Nota interna\nSegunda linha', source: 'Indicação', externalSource: 'gestao-de-trabalho',
        externalId: 'emp-001', createdAt: new Date('2025-05-20T12:34:00Z'),
      },
    });
    sourceContact = await db.clientCompanyContact.create({
      data: {
        clientCompanyId: current.id, name: 'Contato Fictício', role: 'RH',
        phone: '1123456789', whatsapp: '11923456789', email: 'contato@example.invalid',
      },
    });
    const posting = await db.posting.create({
      data: { orgId: org.id, clientCompanyId: former.id, title: 'Vaga fictícia', slug: 'vaga-ficticia' },
    });
    sourcePostingId = posting.id;
    await setPostingClient({ orgId: org.id, userId: admin.id, accessRole: 'SUPER_ADMIN' }, posting.id, current.id);
    sourceCompany = await db.clientCompany.update({ where: { id: current.id }, data: { active: false } });
    auth.session = { user: { orgId: org.id, accessRole: 'ADMIN' } };
    exportText = await (await GET()).text();
  });

  it('restores every profile and contact field, current links and the previous-client history', async () => {
    const dump = JSON.parse(exportText);
    expect(dump.exportVersion).toBe(3);
    expect(dump.clientCompanies.map(({ id }: { id: string }) => id)).toEqual(expect.arrayContaining([sourceCompany.id, formerCompanyId]));
    expect(dump.clientCompanies).toHaveLength(2);
    expect(dump.clientCompanyContacts).toEqual([sourceContact]);
    const slug = `restore-clients-${randomUUID()}`;
    restoreOrg(exportText, slug);
    const copy = await db.organization.findUniqueOrThrow({ where: { slug }, include: { users: true } });
    const companies = await db.clientCompany.findMany({ where: { orgId: copy.id }, include: { commercialContacts: true } });
    const company = companies.find((c) => c.name === sourceCompany.name)!;
    const previous = companies.find((c) => c.name === 'Cliente anterior')!;
    expect(company.id).not.toBe(sourceCompany.id);
    expect(company.commercialContacts).toHaveLength(1);
    expect(company.commercialContacts[0].id).not.toBe(sourceContact.id);
    expect(company).toEqual({
      ...sourceCompany, id: company.id, orgId: copy.id,
      commercialContacts: [{ ...sourceContact, id: company.commercialContacts[0].id, clientCompanyId: company.id }],
    });
    expect(previous).toMatchObject({ active: true, createdAt: null });
    expect(previous.id).not.toBe(formerCompanyId);
    const posting = await db.posting.findFirstOrThrow({ where: { orgId: copy.id } });
    expect(posting).toMatchObject({ title: 'Vaga fictícia', clientCompanyId: company.id });
    expect(posting.id).not.toBe(sourcePostingId);
    const history = await clientPostingHistory({ orgId: copy.id, userId: copy.users[0].id, accessRole: 'SUPER_ADMIN' }, previous.id);
    expect(history.previous).toEqual([expect.objectContaining({ subjectId: posting.id, title: posting.title })]);
    expect(await db.contact.count({ where: { orgId: copy.id } })).toBe(0);
  });

  it.each([1, 2])('restores old v%s dumps with basic client records and remaps posting links', async (version) => {
    const dump = JSON.parse(exportText);
    dump.exportVersion = version;
    dump.clientCompanies = [{ id: sourceCompany.id, orgId: sourceOrgId, name: sourceCompany.name }];
    delete dump.clientCompanyContacts;
    if (version === 1) {
      for (const key of ['tasks', 'offers', 'requisitions', 'customFieldDefs', 'planSteps', 'transcripts', 'savedReports', 'eeoResponses', 'importRefs']) {
        delete dump[key];
      }
    }
    const slug = `restore-v${version}-${randomUUID()}`;
    restoreOrg(JSON.stringify(dump), slug);
    const copy = await db.organization.findUniqueOrThrow({ where: { slug } });
    const company = await db.clientCompany.findFirstOrThrow({ where: { orgId: copy.id } });
    expect(company).toMatchObject({ name: sourceCompany.name, active: true, createdAt: null, cnpj: null });
    expect(company.id).not.toBe(sourceCompany.id);
    expect(await db.posting.findFirstOrThrow({ where: { orgId: copy.id } })).toMatchObject({ clientCompanyId: company.id });
    expect(await db.clientCompanyContact.count({ where: { clientCompanyId: company.id } })).toBe(0);
  });

  it.each([
    ['company', /Client company belongs to another organization/],
    ['contact', /Commercial contact references a client company outside the export/],
    ['posting link', /Posting references a client company outside the export/],
    ['posting owner', /Posting belongs to another organization/],
  ] as const)('rejects a foreign %s and leaves the destination untouched', async (record, message) => {
    const dump = JSON.parse(exportText);
    if (record === 'company') dump.clientCompanies[0].orgId = foreignOrgId;
    if (record === 'contact') dump.clientCompanyContacts[0].clientCompanyId = foreignCompanyId;
    if (record === 'posting link') dump.postings[0].clientCompanyId = foreignCompanyId;
    if (record === 'posting owner') dump.postings[0].orgId = foreignOrgId;
    const slug = `invalid-restore-${randomUUID()}`;
    expect(() => restoreOrg(JSON.stringify(dump), slug)).toThrow(message);
    expect(await db.organization.findUnique({ where: { slug } })).toBeNull();
    expect(await db.clientCompanyContact.count({ where: { clientCompanyId: foreignCompanyId } })).toBe(1);
  });
});
