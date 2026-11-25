import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { mappingSuggestion, RGA_IMPORT_PROVIDER, WORK_SOURCE, type RgaImportKind } from '@/lib/rga-import';
import { confirmRgaImport, inspectRgaSpreadsheet, previewRgaImport, type RgaSpreadsheet } from '@/server/imports/rga-spreadsheet';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const buildFile = (kind: RgaImportKind, csv: string, mapping: Record<string, string> = {}): RgaSpreadsheet =>
  ({ name: 'dados-ficticios.csv', data: Buffer.from(csv), kind, headerRow: 1, mapping });

async function agency() {
  const { org, admin } = await createOrg();
  await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY' } });
  return { org, ctx: { orgId: org.id, userId: admin.id, accessRole: 'SUPER_ADMIN' } };
}

describe('RGA spreadsheet mapping', () => {
  it('recognizes actual confirmed headings and leaves ambiguous or unknown fields for the operator', () => {
    expect(mappingSuggestion('company', ['Nome', 'CNPJ', 'Telefone', 'Telefone 2', 'Canais']))
      .toEqual({ legalName: '0', cnpj: '1', phone: '2', secondaryPhone: '3', channels: '4' });
    expect(mappingSuggestion('talent', ['Nome Completo', 'E-mail', 'E-mail', 'ID Origem']))
      .toEqual({ name: '0', externalId: '3' });
    expect(mappingSuggestion('posting', ['Qualquer coluna'])).toEqual({});
  });
});

describe.skipIf(!hasDb)('RGA spreadsheet import', () => {
  beforeEach(() => vi.stubEnv('AUTH_SECRET', 'rga-spreadsheet-local-test'));
  afterEach(() => vi.unstubAllEnvs());

  it('reconciles explicit and documented storage grants by source ID and preserves withdrawals', async () => {
    const { org, ctx } = await agency();
    const talent = buildFile('talent', 'nome;id\nPessoa Um;a\nPessoa Dois;b\nPessoa Três;c', { name: '0', externalId: '1' });
    await confirmRgaImport(ctx, talent, (await previewRgaImport(ctx, talent)).ticket);
    const third = await db.contact.findFirstOrThrow({ where: { orgId: org.id, name: 'Pessoa Três' } });
    await db.consentRecord.create({ data: { orgId: org.id, contactId: third.id, purpose: 'PROFILE_STORAGE', withdrawnAt: new Date() } });
    const term = [
      'Ao enviar este formulário, autorizo a RGA Consultoria de RH a coletar, armazenar e usar meus dados para participação em processos seletivos e inclusão no Banco de Talentos.',
      'Se necessário, meus dados poderão ser compartilhados com empresas contratantes exclusivamente para fins de recrutamento.',
      'Estou ciente de que posso solicitar acesso, correção ou exclusão dos meus dados a qualquer momento pelo e-mail: oportunidades@consultoriarga.com.br.',
      'Declaro que li e concordo com este termo.',
    ].join(' ');
    const file = buildFile('consent', ['ID Origem;"' + term + '"', 'a;Li as informações acima e concordo.', 'b;', 'c;', 'sem-vinculo;'].join('\n'), { externalId: '0', acceptance: '1' });
    expect((await previewRgaImport(ctx, file)).report).toMatchObject({ updated: 1, duplicates: 1, errors: 2 });
    file.attestation = 'DOC-FICTICIO-01';
    const preview = await previewRgaImport(ctx, file);
    expect(preview.report).toMatchObject({ updated: 2, duplicates: 1, errors: 1 });
    expect(await db.consentRecord.count({ where: { orgId: org.id, withdrawnAt: null } })).toBe(0);
    await expect(confirmRgaImport(ctx, { ...file, attestation: 'OUTRO-DOC' }, preview.ticket)).rejects.toThrow(/nova prévia/);
    await confirmRgaImport(ctx, file, preview.ticket);
    expect((await previewRgaImport(ctx, file)).report).toMatchObject({ updated: 0, duplicates: 3 });
    expect(await db.consentRecord.count({ where: { orgId: org.id, withdrawnAt: null, purpose: 'PROFILE_STORAGE' } })).toBe(2);
    const audit = await db.event.findMany({ where: { orgId: org.id, verb: 'consent.reconciled' } });
    expect(audit.map(e => (e.payload as {evidence: string}).evidence).sort()).toEqual(['ADMIN_ATTESTATION', 'SHEET_ACCEPTANCE']);
  });

  it('links historical clients only with verified job IDs, titles and unique clients', async () => {
    const { org, ctx } = await agency();
    const client = await db.clientCompany.create({ data: { orgId: org.id, name: 'Empresa Fictícia' } });
    const other = await db.clientCompany.create({ data: { orgId: org.id, name: 'Outro Cliente Fictício' } });
    const posting = await db.posting.create({ data: { orgId: org.id, slug: 'vaga-ficticia', title: 'Técnico', state: 'PUBLISHED' } });
    await db.importRef.create({ data: { orgId: org.id, provider: RGA_IMPORT_PROVIDER, kind: 'posting', externalId: WORK_SOURCE + ':X', internalId: posting.id } });
    const file = (lines: string[]) => buildFile('postingClient', ['Gerar ID;Cliente;Cargo', ...lines].join('\n'),
      mappingSuggestion('postingClient', ['Gerar ID','Cliente','Cargo']));
    const row = 'X;Empresa Fictícia;TECNICO';
    expect((await previewRgaImport(ctx, file([row, row]))).report.errors).toBe(2);
    expect((await previewRgaImport(ctx, file(['X;Empresa Fictícia;Outro Cargo']))).report.errors).toBe(1);
    const source = file([row, 'Z;Empresa Fictícia;Técnico']);
    const preview = await previewRgaImport(ctx, source);
    expect(preview.report).toMatchObject({ updated: 1, errors: 1 });
    expect((await db.posting.findUniqueOrThrow({ where: { id: posting.id } })).clientCompanyId).toBeNull();
    await confirmRgaImport(ctx, source, preview.ticket);
    expect(await db.posting.findUniqueOrThrow({ where: { id: posting.id } })).toMatchObject({ clientCompanyId: client.id, state: 'PUBLISHED' });
    expect((await previewRgaImport(ctx, source)).report.duplicates).toBe(1);
    const conflict = file(['X;' + other.name + ';Técnico']);
    expect((await previewRgaImport(ctx, conflict)).report.errors).toBe(1);
    expect(await db.event.count({ where: { orgId: org.id, subjectId: posting.id, verb: 'posting.client_linked' } })).toBe(1);
  });

  it('previews and records companies, vacancies and applicants without publishing, messaging or granting consent', async () => {
    const { org, ctx } = await agency();
    const companies = buildFile('company', [
      'Nome;CNPJ;Nome Fantasia;Telefone;Telefone 2;Canais;Contato;Cargo;Data Cadastro',
      'Aurora Fictícia Ltda;11.222.333/0001-81;Aurora Fictícia;(11) 3333-0000;"+55 (11) 99999-0000";Portal e telefone;Pessoa Fictícia;RH;1/2/2024',
      'Aurora Fictícia Ltda;11222333000181;Aurora Fictícia',
      'Dados incorretos;123',
    ].join('\n'));
    companies.mapping = mappingSuggestion(companies.kind, inspectRgaSpreadsheet(ctx, companies, 1).headers);
    const preview = await previewRgaImport(ctx, companies);
    expect(preview.report).toMatchObject({ total: 3, created: 1, updated: 0, duplicates: 1, errors: 1 });
    expect(await db.clientCompany.count({ where: { orgId: org.id } })).toBe(0);
    expect(await db.importJob.count({ where: { orgId: org.id } })).toBe(0);
    const run = await confirmRgaImport(ctx, companies, preview.ticket);
    expect(run.report).toEqual(preview.report);
    const company = await db.clientCompany.findFirstOrThrow({ where: { orgId: org.id } });
    expect(company).toMatchObject({
      name: 'Aurora Fictícia', cnpj: '11222333000181', phone: '1133330000', secondaryPhone: '11999990000', channels: 'Portal e telefone',
      responsibleName: 'Pessoa Fictícia', responsibleRole: 'RH', createdAt: new Date('2024-02-01T03:00:00Z'),
    });
    expect(await db.importJob.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ provider: RGA_IMPORT_PROVIDER, status: 'SUCCEEDED' });
    expect(await db.importRef.findFirstOrThrow({ where: { jobId: run.id, kind: 'clientCompany' } }))
      .toMatchObject({ internalId: company.id, externalId: `${WORK_SOURCE}:cnpj:11222333000181` });
    expect((await previewRgaImport(ctx, companies)).report).toMatchObject({ created: 0, duplicates: 2, errors: 1 });

    const jobs = buildFile('posting', 'Código,Título,Cliente,Cidade,Valor,Descrição\nv-fic,Atendimento,Aurora Fictícia,Recife,"R$ 3.001,50",Tudo fictício', {
      externalId: '0', title: '1', clientName: '2', location: '3', salaryMin: '4', description: '5',
    });
    await confirmRgaImport(ctx, jobs, (await previewRgaImport(ctx, jobs)).ticket);
    const job = await db.posting.findFirstOrThrow({ where: { orgId: org.id } });
    expect(job).toMatchObject({
      state: 'DRAFT', clientCompanyId: company.id, salaryCurrency: 'BRL',
      content: { description: 'Tudo fictício', origemPlanilha: { salarioMin: 'R$ 3.001,50' } },
    });
    const editedJob = await db.posting.update({ where: { id: job.id }, data: { title: 'Título alterado no ATS' } });
    expect((await previewRgaImport(ctx, jobs)).report).toMatchObject({ duplicates: 1 });
    expect(editedJob.title).toBe('Título alterado no ATS');

    const candidates = buildFile('talent', [
      'Nome Completo;E-mail;Telefone (com DDD);ID Origem;Cidade;Estado;Pretensão Salarial;Upload de Currículo;Vaga',
      'Pessoa Candidata;pessoa@example.invalid;(11) 99999-0100;c-fic;Recife;PE;3.000,25;https://example.invalid/arquivo;v-fic',
    ].join('\n'));
    candidates.mapping = { ...mappingSuggestion(candidates.kind, inspectRgaSpreadsheet(ctx, candidates, 1).headers), postingRef: '8' };
    await confirmRgaImport(ctx, candidates, (await previewRgaImport(ctx, candidates)).ticket);
    const contact = await db.contact.findFirstOrThrow({ where: { orgId: org.id } });
    expect(contact).toMatchObject({
      name: 'Pessoa Candidata', emails: ['pessoa@example.invalid'], phones: ['11999990100'], location: 'Recife, PE',
      resumeFileId: null, emailOptOutAt: expect.any(Date),
    });
    const opportunity = await db.opportunity.findFirstOrThrow({ where: { orgId: org.id } });
    expect(opportunity).toMatchObject({ contactId: contact.id, postingId: job.id, origin: 'SOURCED', customFields: { origemPlanilha: { salarioBRL: 3000.25 } } });
    expect(await db.emailMessage.count({ where: { orgId: org.id } })).toBe(0);
    expect(await db.consentRecord.count({ where: { orgId: org.id } })).toBe(0);
    expect(await db.storedFile.count({ where: { orgId: org.id } })).toBe(0);
    const rerun = await previewRgaImport(ctx, candidates);
    expect(rerun.report).toMatchObject({ created: 0, duplicates: 1 });
    await confirmRgaImport(ctx, candidates, rerun.ticket);
    const conflictingId = { ...candidates, data: Buffer.from(Buffer.from(candidates.data).toString().replace('c-fic', 'c-outro')) };
    expect((await previewRgaImport(ctx, conflictingId)).report).toMatchObject({ created: 0, errors: 1 });
    expect(await db.contact.count({ where: { orgId: org.id } })).toBe(1);
    expect(await db.opportunity.count({ where: { orgId: org.id } })).toBe(1);
  });

  it('protects previews across workspace, permissions, file edits and concurrent confirmations', async () => {
    const { ctx } = await agency();
    const { ctx: other } = await agency();
    const file = buildFile('company', 'Nome Fantasia,CNPJ,ID\nEmpresa Fictícia,11.222.333/0001-81,cliente-fic', { name: '0', cnpj: '1', externalId: '2' });
    await expect(previewRgaImport({ ...ctx, accessRole: 'TEAM_MEMBER' }, file)).rejects.toThrow('administradores');
    const preview = await previewRgaImport(ctx, file);
    await expect(confirmRgaImport(other, file, preview.ticket)).rejects.toThrow('nova prévia');
    await expect(confirmRgaImport(ctx, { ...file, data: Buffer.from('Nome Fantasia,CNPJ,ID\nOutro Nome,11.222.333/0001-81,cliente-fic') }, preview.ticket)).rejects.toThrow('nova prévia');
    const outcomes = await Promise.allSettled([confirmRgaImport(ctx, file, preview.ticket), confirmRgaImport(ctx, file, preview.ticket)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.clientCompany.count({ where: { orgId: ctx.orgId } })).toBe(1);
    expect(await db.clientCompany.count({ where: { orgId: other.orgId } })).toBe(0);
    const jobs = buildFile('posting', 'Código,Título,Empresa\nv-fic,Vaga,cliente-fic', { externalId: '0', title: '1', clientRef: '2' });
    expect((await previewRgaImport(other, jobs)).report).toMatchObject({ created: 0, errors: 1 });
    expect((await previewRgaImport(ctx, jobs)).report).toMatchObject({ created: 1, errors: 0 });
    expect(await db.clientCompany.findFirstOrThrow({ where: { orgId: ctx.orgId } }))
      .toMatchObject({ externalSource: WORK_SOURCE, externalId: 'cliente-fic' });
  });

  it('rejects conflicting candidate identities and preserves recruiter-filled values on repeat import', async () => {
    const { ctx } = await agency();
    const orgId = ctx.orgId;
    const first = await db.contact.create({ data: { orgId, name: 'Pessoa Fictícia', emails: ['pessoa@example.invalid'], headline: 'Texto interno' } });
    await db.contact.create({ data: { orgId, name: 'Outra Pessoa Fictícia', phones: ['11999990000'] } });
    const file = buildFile('talent', 'Nome,Email,Telefone,Cargo\nPessoa Fictícia,pessoa@example.invalid,(11) 99999-0000,Operações', {
      name: '0', email: '1', phone: '2', interest: '3',
    });
    expect((await previewRgaImport(ctx, file)).report).toMatchObject({ created: 0, errors: 1 });
    const good = { ...file, data: Buffer.from('Nome,Email,Telefone,Cargo\nPessoa Fictícia,pessoa@example.invalid,,Operações') };
    const preview = await previewRgaImport(ctx, good);
    expect(preview.report).toMatchObject({ updated: 1, errors: 0 });
    await confirmRgaImport(ctx, good, preview.ticket);
    expect(await db.contact.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ headline: 'Texto interno' });
    expect(await db.contact.count({ where: { orgId } })).toBe(2);
    expect((await previewRgaImport(ctx, good)).report).toMatchObject({ duplicates: 1 });
  });

  it('imports talent without a vacancy into a standalone profile and preserves original metadata', async () => {
    const { ctx } = await agency();
    await db.stage.deleteMany({ where: { orgId: ctx.orgId } });
    const file = buildFile('talent', 'Nome;Email;Pretensão;UF;Experiência;Obs\nPessoa Fictícia;pessoa@example.invalid;3.500,00;AM;Manutenção industrial;Registro fictício', {
      name: '0', email: '1', salary: '2', state: '3', experience: '4', notes: '5',
    });
    const preview = await previewRgaImport(ctx, file);
    expect(preview.report).toMatchObject({ created: 1, errors: 0 });
    await confirmRgaImport(ctx, file, preview.ticket);
    expect(await db.contact.findFirst({ where: { orgId: ctx.orgId } })).toMatchObject({
      salaryExpectation: 350000, careerProfile: { state: 'AM', experience: 'Manutenção industrial' },
    });
    expect(await db.opportunity.count({ where: { orgId: ctx.orgId } })).toBe(0);
    expect(await db.importRef.findFirst({ where: { orgId: ctx.orgId, kind: 'contact' } })).toMatchObject({
      snapshot: { origemPlanilha: { observacao: 'Registro fictício' } },
    });
    expect((await previewRgaImport(ctx, file)).report).toMatchObject({ duplicates: 1 });
  });

  it('keeps separate historical selections for one contact and reimports them by origin evidence', async () => {
    const { ctx } = await agency();
    const orgId = ctx.orgId;
    const headers = 'Data Seleção;Empresa;Cargo;Nome;Telefone;Entrevista marcada;Data Entrevista;Candidato Admitido;ENVIO DE PARECER;Observação';
    const first = '1/2/2024;Aurora Fictícia;Analista;Pessoa Fictícia;(11) 99999-0001;Sim;06/02/2024;Não;Sim;Primeira seleção';
    const second = '15/3/2024;Brisa Fictícia;Coordenação;Pessoa Fictícia;11999990001;Sim;20/03/2024;Sim;Sim;Segunda seleção';
    const file = buildFile('candidate', [headers, first, second, first].join('\n'), mappingSuggestion('candidate', headers.split(';')));
    const preview = await previewRgaImport(ctx, file);
    expect(preview.report).toMatchObject({ created: 2, duplicates: 1, errors: 0 });
    await confirmRgaImport(ctx, file, preview.ticket);

    const contact = await db.contact.findFirstOrThrow({ where: { orgId }, select: { id: true } });
    expect(await db.contact.count({ where: { orgId } })).toBe(1);
    const selections = await db.opportunity.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
    expect(selections).toMatchObject([
      { contactId: contact.id, postingId: null, customFields: { origemPlanilha: {
        empresaInformada: 'Aurora Fictícia', cargo: 'Analista', dataOrigem: '1/2/2024', dataEntrevista: '06/02/2024',
        candidatoAdmitido: 'Não', envioParecer: 'Sim', observacao: 'Primeira seleção',
      } } },
      { contactId: contact.id, postingId: null, customFields: { origemPlanilha: {
        empresaInformada: 'Brisa Fictícia', cargo: 'Coordenação', dataOrigem: '15/3/2024', dataEntrevista: '20/03/2024',
        candidatoAdmitido: 'Sim', envioParecer: 'Sim', observacao: 'Segunda seleção',
      } } },
    ]);
    const rerun = { ...file, data: Buffer.from([headers, second, first.replace('1/2/2024', '2024-02-01')].join('\n')) };
    const repeated = await previewRgaImport(ctx, rerun);
    expect(repeated.report).toMatchObject({ created: 0, updated: 0, duplicates: 2, errors: 0 });
    await confirmRgaImport(ctx, rerun, repeated.ticket);
    expect(await db.opportunity.count({ where: { orgId } })).toBe(2);

    const ambiguous = { ...file, data: Buffer.from([headers, first.replace('Primeira seleção', 'Parecer divergente'), first.replace('1/2/2024;', ';')].join('\n')) };
    expect((await previewRgaImport(ctx, ambiguous)).report).toMatchObject({ created: 0, duplicates: 0, errors: 2 });
  });

  it('uses a unique selection ID when historical dates are missing and rejects conflicting reuse', async () => {
    const { ctx } = await agency();
    const header = 'Nome;Telefone;Seleção';
    const file = buildFile('candidate', [header, 'Pessoa Fictícia;11999990001;sel-1', 'Pessoa Fictícia;11999990001;sel-2'].join('\n'), {
      name: '0', phone: '1', selectionId: '2',
    });
    const preview = await previewRgaImport(ctx, file);
    expect(preview.report).toMatchObject({ created: 2, errors: 0 });
    await confirmRgaImport(ctx, file, preview.ticket);
    expect((await previewRgaImport(ctx, file)).report).toMatchObject({ duplicates: 2, errors: 0 });

    const collision = { ...file, data: Buffer.from([header, 'Outra Pessoa Fictícia;11999990002;sel-1'].join('\n')) };
    expect((await previewRgaImport(ctx, collision)).report).toMatchObject({ created: 0, duplicates: 0, errors: 1 });
    expect(await db.contact.count({ where: { orgId: ctx.orgId } })).toBe(1);
  });
});
