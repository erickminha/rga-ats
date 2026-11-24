import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type Contact, type ClientCompany, type Posting } from '@prisma/client';
import { db } from '@/lib/db';
import { brazilianStates, cnpjKey, companyNameKey, parseCompany, parsePhone, validCnpj } from '@/lib/client-company';
import { columnsByKind, importKinds, RGA_IMPORT_PROVIDER, TALENT_SOURCE, WORK_SOURCE, type RgaImportKind, type RgaImportReport } from '@/lib/rga-import';
import { isAdmin, type SessionContext } from '@/lib/session';
import { lockClientWrites } from '@/server/client-companies';
import { actorOf, emitEvent } from '@/server/events';
import { invalidateLists } from '@/server/lists/cache';
import { readSpreadsheet } from '@/server/spreadsheet';

export class RgaImportError extends Error {}

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const nullable = (text?: string) => text?.trim() || null;
const onlyMissing = <T extends object>(record: T, incoming: Partial<T>) =>
  Object.fromEntries(Object.entries(incoming).filter(([key, value]) => value != null && (record[key as keyof T] == null || record[key as keyof T] === ''))) as Partial<T>;

function requireAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx) || !ctx.userId) throw new RgaImportError('Somente administradores podem importar planilhas.');
}

function rowsOf(file: { name: string; data: Uint8Array }, headerRow: number) {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) {
    throw new RgaImportError('Informe uma linha de cabeçalho presente entre as primeiras 100 linhas lidas.');
  }
  if (!/\.(csv|xlsx)$/i.test(file.name) || !file.data.length || file.data.length > MAX_FILE_BYTES) {
    throw new RgaImportError('Selecione um CSV ou XLSX de até 4 MB.');
  }
  const zipped = file.data[0] === 0x50 && file.data[1] === 0x4b;
  if (zipped !== file.name.toLowerCase().endsWith('.xlsx')) throw new RgaImportError('A extensão não corresponde ao conteúdo do arquivo.');
  // Reuse the bounded reader used by the group import.
  try {
    const rows = readSpreadsheet(file.data, { headerRow });
    if (!rows?.length) throw new RgaImportError('A planilha não contém linhas legíveis.');
    return rows;
  } catch (error) {
    if (error instanceof RgaImportError) throw error;
    if (error instanceof Error && error.message.startsWith('A planilha excede')) throw new RgaImportError(error.message);
    throw new RgaImportError('Não foi possível ler a planilha. Confira o formato do arquivo.');
  }
}

function headersAt(rows: string[][], headerRow: number) {
  if (!rows[headerRow - 1]) {
    throw new RgaImportError('Informe uma linha de cabeçalho presente entre as primeiras 100 linhas lidas.');
  }
  return rows[headerRow - 1].map((label) => label.trim().slice(0, 160));
}

export function inspectRgaSpreadsheet(ctx: SessionContext, file: { name: string; data: Uint8Array }, headerRow: number) {
  requireAdmin(ctx);
  const rows = rowsOf(file, headerRow);
  return { headers: headersAt(rows, headerRow), rows: rows.length - headerRow };
}

export type RgaSpreadsheet = {
  name: string;
  data: Uint8Array;
  kind: RgaImportKind;
  headerRow: number;
  mapping: Record<string, unknown>;
};

function parseFile(ctx: SessionContext, file: RgaSpreadsheet) {
  requireAdmin(ctx);
  if (!Object.hasOwn(importKinds, file.kind)) throw new RgaImportError('Escolha o tipo de dados.');
  const rows = rowsOf(file, file.headerRow);
  const headers = headersAt(rows, file.headerRow);
  const assignments: [string, number][] = [];
  const selected = new Set<number>();
  for (const [key, label] of columnsByKind[file.kind]) {
    const index = file.mapping[key];
    if (index === undefined || index === '') continue;
    if (typeof index !== 'string' || !/^\d{1,2}$/.test(index) || +index >= headers.length || !headers[+index]) {
      throw new RgaImportError(`Selecione uma coluna válida para ${label}.`);
    }
    if (selected.has(+index)) throw new RgaImportError('Use cada coluna de origem uma única vez.');
    selected.add(+index);
    assignments.push([key, +index]);
  }
  const mapped = (key: string) => assignments.some(([name]) => name === key);
  if (file.kind === 'company' && !mapped('name') && !mapped('legalName')) throw new RgaImportError('Mapeie o nome ou a razão social.');
  if (file.kind === 'posting' && (!mapped('title') || !mapped('externalId'))) throw new RgaImportError('Mapeie o título e o ID de origem da vaga.');
  if ((file.kind === 'candidate' || file.kind === 'talent') && (!mapped('name') || !['email', 'phone', 'externalId'].some(mapped))) {
    throw new RgaImportError('Mapeie o nome e pelo menos um identificador do candidato.');
  }
  const records = rows.slice(file.headerRow).flatMap((record, idx) => {
    if (!record.some((cell) => cell.trim())) return [];
    return [{ row: file.headerRow + idx + 1, fields: Object.fromEntries(assignments.map(([key, index]) => [key, record[index]?.trim() || ''])) }];
  });
  if (!records.length) throw new RgaImportError('A planilha não contém registros abaixo do cabeçalho.');
  return { records, key: digest(file.data), assignments };
}

function calendar(raw: string | undefined, xlsx: boolean) {
  if (!raw) return undefined;
  if (xlsx && /^\d{5}(?:\.\d+)?$/.test(raw)) {
    return new Date(Date.UTC(1899, 11, 30, 3) + Math.round(Number(raw) * 86_400_000));
  }
  const matches = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = raw.match(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/);
  let timestamp: string;
  let day: string;
  if (matches) {
    const [, date, month, year, hour = '00', minute = '00', second = '00'] = matches;
    day = `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`;
    timestamp = `${day}T${hour.padStart(2, '0')}:${minute}:${second}-03:00`;
  } else if (iso) {
    day = raw.slice(0, 10);
    timestamp = raw.length === 10 ? raw + 'T00:00:00-03:00' : raw;
  } else throw new RgaImportError('Data inválida. Use DD/MM/AAAA ou uma data ISO.');
  const date = new Date(timestamp);
  const check = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(+date) || Number.isNaN(+check) || check.toISOString().slice(0, 10) !== day) {
    throw new RgaImportError('Data inválida. Confira o dia, o mês e o ano.');
  }
  return date;
}

function currency(raw: string | undefined, xlsx: boolean) {
  if (!raw) return undefined;
  const text = raw.replace(/^R\$\s*/, '').trim();
  const excelDecimal = xlsx && /^\d+\.\d{1,2}$/.test(text);
  if (!excelDecimal && !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) throw new RgaImportError('Valor inválido. Use um número no padrão brasileiro.');
  const value = Number(excelDecimal ? text : text.replace(/\./g, '').replace(',', '.'));
  if (value > 2_147_483_647) throw new RgaImportError('O valor excede o limite aceito.');
  return value;
}

function external(value?: string) {
  if (!value) return null;
  if (value.length > 180) throw new RgaImportError('O identificador de origem é muito longo.');
  return value;
}

function firstMatch(ids: Array<string | undefined>) {
  const unique = new Set(ids.filter((id): id is string => !!id));
  if (unique.size > 1) throw new RgaImportError('Conflito de identidade. Confira os identificadores antes de importar.');
  return unique.values().next().value as string | undefined;
}

function single<T extends { id: string }>(rows: T[]) {
  if (rows.length > 1) throw new RgaImportError('Há mais de um registro correspondente. Revise a duplicidade manualmente.');
  return rows[0]?.id;
}

function recordId(ctx: SessionContext, fileKey: string, row: number, kind: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new RgaImportError('A importação requer a configuração de autenticação do ATS.');
  const bytes = createHmac('sha256', secret).update(JSON.stringify([ctx.orgId, fileKey, row, kind])).digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const id = bytes.subarray(0, 16).toString('hex');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

type ContactMatch = Pick<Contact, 'id' | 'name' | 'emails' | 'phones' | 'headline' | 'location' | 'isAnonymized'>;
type JobMatch = Pick<Posting, 'id' | 'title' | 'location' | 'clientCompanyId' | 'content' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'>;
type Counts = 'created' | 'updated' | 'duplicates';
type DataFields = Record<string, string>;
type Ref = Pick<Prisma.ImportRefCreateManyInput, 'kind' | 'externalId' | 'internalId' | 'created'>;
type Writes = ReturnType<typeof emptyWrites>;
const SELECTION_PREFIX = `${WORK_SOURCE}:selecao:`;
const SELECTION_ID_PREFIX = `${SELECTION_PREFIX}id:`;

function selectionEvidence(fields: Prisma.JsonValue | Prisma.InputJsonValue | null) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !('origemPlanilha' in fields)) return null;
  const detail = fields.origemPlanilha;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  return JSON.stringify([
    'empresaInformada', 'cargo', 'dataSelecaoNormalizada', 'statusInformado', 'entrevistaMarcada',
    'dataEntrevista', 'candidatoAdmitido', 'envioParecer', 'observacao',
  ].map((key) => {
    const value = (detail as Prisma.InputJsonObject)[key];
    return typeof value === 'string' ? companyNameKey(value) : null;
  }));
}

function emptyWrites() {
  return {
    companyNew: [] as Prisma.ClientCompanyCreateManyInput[],
    companyUpdates: [] as { id: string; data: Prisma.ClientCompanyUpdateManyMutationInput }[],
    postingNew: [] as Prisma.PostingCreateManyInput[],
    postingUpdates: [] as { id: string; data: Prisma.PostingUncheckedUpdateManyInput }[],
    contactNew: [] as Prisma.ContactCreateManyInput[],
    contactUpdates: [] as { id: string; data: Prisma.ContactUpdateManyMutationInput }[],
    opportunityNew: [] as Prisma.OpportunityCreateManyInput[],
    stageTransitions: [] as Prisma.StageTransitionCreateManyInput[],
    refs: [] as Ref[],
  };
}

async function planImport(tx: Prisma.TransactionClient, ctx: SessionContext, file: RgaSpreadsheet, parsed: ReturnType<typeof parseFile>) {
  const orgId = ctx.orgId;
  const fileKey = parsed.key + JSON.stringify(parsed.assignments);
  const xlsx = file.name.toLowerCase().endsWith('.xlsx');
  const candidate = file.kind === 'candidate' || file.kind === 'talent';
  const source = file.kind === 'talent' ? TALENT_SOURCE : WORK_SOURCE;
  const [org, companies, jobs, contacts, opportunities, stage, ledger] = await Promise.all([
    tx.organization.findUnique({ where: { id: orgId }, select: { kind: true } }),
    tx.clientCompany.findMany({ where: { orgId }, orderBy: { id: 'asc' } }),
    file.kind !== 'company' ? tx.posting.findMany({ where: { orgId }, select: { id: true, title: true, location: true, clientCompanyId: true, content: true, salaryMin: true, salaryMax: true, salaryCurrency: true }, orderBy: { id: 'asc' } }) : [],
    candidate ? tx.contact.findMany({ where: { orgId }, select: { id: true, name: true, emails: true, phones: true, headline: true, location: true, isAnonymized: true }, orderBy: { id: 'asc' } }) : [],
    candidate ? tx.opportunity.findMany({ where: { orgId }, select: { id: true, contactId: true, postingId: true, customFields: file.kind === 'candidate' } }) : [],
    candidate ? tx.stage.findFirst({ where: { orgId, type: { in: ['LEAD', 'APPLICANT'] } }, orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true } }) : null,
    tx.importRef.findMany({ where: { orgId, provider: RGA_IMPORT_PROVIDER }, select: { kind: true, externalId: true, internalId: true } }),
  ]);
  if (!org || (file.kind === 'company' && org.kind !== 'AGENCY')) throw new RgaImportError('A importação de empresas está disponível no espaço de trabalho da agência.');
  const stageId = stage?.id;
  if (candidate && !stageId) throw new RgaImportError('Crie uma etapa inicial no funil da organização antes de importar candidatos.');

  const companyRows = new Map<string, ClientCompany>(companies.map((row) => [row.id, row]));
  const jobRows = new Map<string, JobMatch>(jobs.map((row) => [row.id, row]));
  const trackedJobs = new Set(ledger.filter((ref) => ref.kind === 'posting').map((ref) => ref.internalId));
  const contactRows = new Map<string, ContactMatch>(contacts.map((row) => [row.id, row]));
  const refKey = (kind: string, key: string) => `${kind}:\0:${key}`;
  const refs = new Map(ledger.map((ref) => [refKey(ref.kind, ref.externalId), ref.internalId]));
  const write = emptyWrites();
  const seen = new Set<string>();
  const refId = (kind: string, key: string) => refs.get(refKey(kind, key));
  const setRef = (kind: string, externalId: string, internalId: string, created: boolean) => {
    const key = refKey(kind, externalId);
    if (refs.has(key)) return false;
    refs.set(key, internalId);
    write.refs.push({ kind, externalId, internalId, created });
    return true;
  };

  function companyId(f: DataFields, companySource: string) {
    const id = external(f.clientRef);
    const cnpj = f.clientCnpj ? cnpjKey(f.clientCnpj) : null;
    if (cnpj && !validCnpj(cnpj)) throw new RgaImportError('CNPJ da empresa vinculada inválido.');
    const name = f.clientName ? companyNameKey(f.clientName) : '';
    const all = [...companyRows.values()];
    const match = firstMatch([
      id ? refId('clientCompany', `${companySource}:id:${id}`) : undefined,
      id ? single(all.filter((c) => c.externalSource === companySource && c.externalId === id)) : undefined,
      cnpj ? single(all.filter((c) => c.cnpj === cnpj)) : undefined,
      name ? single(all.filter((c) => companyNameKey(c.name) === name || (c.legalName && companyNameKey(c.legalName) === name))) : undefined,
    ]);
    if ((id || cnpj || name) && (!match || !companyRows.has(match))) throw new RgaImportError('Empresa vinculada não encontrada. Importe ou corrija a referência antes da vaga.');
    const company = match ? companyRows.get(match) : undefined;
    if (cnpj && company?.cnpj && cnpj !== company.cnpj) throw new RgaImportError('O CNPJ informado diverge do cadastro da empresa vinculada.');
    return match;
  }

  function company(f: DataFields, row: number): Counts {
    const date = calendar(f.createdAt, xlsx);
    const ext = external(f.externalId);
    const form = new FormData();
    for (const [name, value] of Object.entries(f)) form.set(name, value);
    const status = companyNameKey(f.status ?? '');
    if (status && !['ativo', 'ativa', 'inativo', 'inativa', 'active', 'inactive'].includes(status)) throw new RgaImportError('Situação de empresa não reconhecida.');
    form.set('status', ['inativo', 'inativa', 'inactive'].includes(status) ? 'inactive' : 'active');
    let data: ReturnType<typeof parseCompany>;
    try { data = parseCompany(form); } catch (error) {
      throw new RgaImportError(error instanceof Error ? error.message : 'Dados da empresa inválidos.');
    }
    const names = [companyNameKey(data.name), ...(data.legalName ? [companyNameKey(data.legalName)] : [])];
    const keys = [
      ...(ext ? [`${source}:id:${ext}`] : []),
      ...(data.cnpj ? [`${source}:cnpj:${data.cnpj}`] : []),
      ...(!ext && !data.cnpj ? [`${source}:nome:${digest(names[0])}`] : []),
    ];
    const known = firstMatch(keys.map((key) => refId('clientCompany', key)));
    if (known && !companyRows.has(known)) return 'duplicates';
    const all = [...companyRows.values()];
    const matched = firstMatch([
      known,
      ext ? single(all.filter((c) => c.externalSource === source && c.externalId === ext)) : undefined,
      data.cnpj ? single(all.filter((c) => c.cnpj === data.cnpj)) : undefined,
      single(all.filter((c) => names.includes(companyNameKey(c.name)) || Boolean(c.legalName && names.includes(companyNameKey(c.legalName))))),
    ]);
    const id = matched ?? recordId(ctx, fileKey, row, 'company');
    if (seen.has(id)) return 'duplicates';
    const current = companyRows.get(id);
    if (current?.cnpj && data.cnpj && current.cnpj !== data.cnpj) throw new RgaImportError('O CNPJ diverge do cadastro encontrado pelo nome.');
    if (current?.externalSource === source && ext && current.externalId && ext !== current.externalId) throw new RgaImportError('O ID de origem diverge do cadastro localizado.');
    seen.add(id);
    const linked = keys.map((key) => setRef('clientCompany', key, id, !current)).some(Boolean);
    if (current) {
      const updates = onlyMissing(current, { ...data, createdAt: date, ...(ext && !current.externalSource ? { externalSource: source, externalId: ext } : {}) });
      if (Object.keys(updates).length) {
        write.companyUpdates.push({ id, data: updates });
        companyRows.set(id, { ...current, ...updates });
      }
      return linked || Object.keys(updates).length ? 'updated' : 'duplicates';
    }
    const incoming = { ...data, id, orgId, externalSource: ext ? source : null, externalId: ext, createdAt: date ?? null };
    write.companyNew.push(incoming);
    companyRows.set(id, incoming);
    return 'created';
  }

  function posting(f: DataFields, row: number): Counts {
    if (!f.title || f.title.length > 200) throw new RgaImportError('Informe um título de vaga de até 200 caracteres.');
    const ext = external(f.externalId);
    if (!ext) throw new RgaImportError('Informe o ID de origem da vaga.');
    const key = `${source}:${ext}`;
    const known = refId('posting', key);
    if (known && !jobRows.has(known)) return 'duplicates';
    const linkedCompany = companyId(f, WORK_SOURCE);
    const date = calendar(f.createdAt, xlsx);
    const min = currency(f.salaryMin, xlsx);
    const max = currency(f.salaryMax, xlsx);
    if (min !== undefined && max !== undefined && min > max) throw new RgaImportError('Salário máximo menor que o mínimo.');
    const workplace = { remoto: 'REMOTE', hibrido: 'HYBRID', presencial: 'ONSITE' } as const;
    const commitment = { 'tempo integral': 'FULL_TIME', 'meio periodo': 'PART_TIME', contrato: 'CONTRACT', estagio: 'INTERNSHIP' } as const;
    const mode = companyNameKey(f.workplace ?? '') as keyof typeof workplace;
    const hiring = companyNameKey(f.commitment ?? '') as keyof typeof commitment;
    const location = nullable(f.location);
    const found = known ?? (linkedCompany && location ? single([...jobRows.values()].filter((job) =>
      job.clientCompanyId === linkedCompany && companyNameKey(job.title) === companyNameKey(f.title) && companyNameKey(job.location ?? '') === companyNameKey(location))) : undefined);
    if (!known && found && trackedJobs.has(found)) throw new RgaImportError('Uma vaga correspondente já usa outro ID de origem.');
    const id = found ?? recordId(ctx, fileKey, row, 'posting');
    if (seen.has(id)) return 'duplicates';
    const current = jobRows.get(id);
    if (current && linkedCompany && current.clientCompanyId && current.clientCompanyId !== linkedCompany) throw new RgaImportError('A empresa da vaga diverge do vínculo atual.');
    const content = {
      ...(f.description ? { description: f.description } : {}),
      origemPlanilha: { id: ext, ...(f.workplace ? { modalidade: f.workplace } : {}), ...(f.commitment ? { contrato: f.commitment } : {}),
        ...(f.salaryMin ? { salarioMin: f.salaryMin } : {}), ...(f.salaryMax ? { salarioMax: f.salaryMax } : {}) },
    };
    const fields = {
      location, clientCompanyId: linkedCompany ?? null, content,
      salaryMin: Number.isInteger(min) ? min! : null,
      salaryMax: Number.isInteger(max) ? max! : null,
      salaryCurrency: min !== undefined || max !== undefined ? 'BRL' : null,
    };
    seen.add(id);
    const linked = setRef('posting', key, id, !current);
    if (linked) trackedJobs.add(id);
    if (current) {
      // Updating an existing vacancy keeps both its publication state and its client.
      const { clientCompanyId: _client, ...fillable } = fields;
      const updates = onlyMissing(current, fillable);
      if (Object.keys(updates).length) {
        write.postingUpdates.push({ id, data: updates as Prisma.PostingUncheckedUpdateManyInput });
        jobRows.set(id, { ...current, ...updates });
      }
      return linked || Object.keys(updates).length ? 'updated' : 'duplicates';
    }
    const incoming = {
      id, orgId, title: f.title, slug: 'importada-' + id, ...fields, state: 'DRAFT' as const,
      ...(Object.hasOwn(workplace, mode) ? { workplaceType: workplace[mode] } : {}),
      ...(Object.hasOwn(commitment, hiring) ? { commitment: commitment[hiring] } : {}),
      ...(date ? { createdAt: date } : {}),
    };
    write.postingNew.push(incoming);
    jobRows.set(id, incoming);
    return 'created';
  }

  const comparablePhone = (raw: string) => {
    try { return parsePhone(raw); } catch { return null; }
  };
  const emailsByValue = new Map<string, Set<string>>();
  const phonesByValue = new Map<string, Set<string>>();
  const originIdPrefix = `${source}:id:`;
  const originIdsByContact = new Map(ledger.filter((ref) => ref.kind === 'contact' && ref.externalId.startsWith(originIdPrefix))
    .map((ref) => [ref.internalId, ref.externalId]));
  function indexContacts(contact: ContactMatch) {
    for (const [index, values] of [
      [emailsByValue, contact.emails.map((value) => value.trim().toLowerCase())],
      [phonesByValue, contact.phones.map(comparablePhone)],
    ] as const) {
      for (const value of values) {
        if (!value) continue;
        const ids = index.get(value) ?? new Set<string>();
        ids.add(contact.id);
        index.set(value, ids);
      }
    }
  }
  for (const contact of contacts) indexContacts(contact);
  function contactBy(index: Map<string, Set<string>>, value: string | null) {
    const ids = value ? index.get(value) : undefined;
    if (ids && ids.size > 1) throw new RgaImportError('E-mail ou telefone pertence a mais de um cadastro.');
    return ids?.values().next().value;
  }
  const openingByContact = new Map<string, Set<string>>();
  const importedSelectionIds = new Set(ledger.filter((ref) => ref.kind === 'opportunity' && ref.externalId.startsWith(SELECTION_PREFIX)).map((ref) => ref.internalId));
  const selectionOriginIds = new Map(ledger.filter((ref) => ref.kind === 'opportunity' && ref.externalId.startsWith(SELECTION_ID_PREFIX))
    .map((ref) => [ref.internalId, ref.externalId.slice(SELECTION_ID_PREFIX.length)]));
  const importedSelections = new Map<string, { contactId: string; evidence: string | null }>();
  const namedContacts = new Map<string, string>();
  const openingKey = (contactId: string, postingId: string | null) => `${contactId}:${postingId ?? ''}`;
  for (const opportunity of opportunities) {
    if (importedSelectionIds.has(opportunity.id)) {
      importedSelections.set(opportunity.id, { contactId: opportunity.contactId, evidence: selectionEvidence(opportunity.customFields ?? null) });
      if (!opportunity.postingId) continue;
    }
    const key = openingKey(opportunity.contactId, opportunity.postingId);
    const ids = openingByContact.get(key) ?? new Set<string>();
    ids.add(opportunity.id);
    openingByContact.set(key, ids);
  }

  function person(f: DataFields, row: number): Counts {
    if (!f.name || f.name.length > 180) throw new RgaImportError('Informe um nome de candidato de até 180 caracteres.');
    const email = nullable(f.email)?.toLowerCase() ?? null;
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new RgaImportError('E-mail inválido.');
    const phone = f.phone ? comparablePhone(f.phone) : null;
    if (f.phone && !phone) throw new RgaImportError('Telefone brasileiro inválido. Confira o DDD e o número.');
    const ext = external(f.externalId);
    if (!ext && !email && !phone) throw new RgaImportError('Informe e-mail, telefone ou ID de origem.');
    const date = calendar(f.createdAt, xlsx);
    const salary = currency(f.salary, xlsx);
    const state = nullable(f.state);
    const uf = state && brazilianStates.includes(state.toUpperCase() as typeof brazilianStates[number]) ? state.toUpperCase() : state;
    const location = [f.district, f.city, uf].filter(Boolean).join(', ') || null;
    const interest = [f.interest, f.otherInterest].filter(Boolean).join(' · ');
    const headline = nullable(f.experience) || nullable(interest);
    const postingExternal = external(f.postingRef);
    const postingId = postingExternal ? refId('posting', `${WORK_SOURCE}:${postingExternal}`) : undefined;
    if (postingExternal && (!postingId || !jobRows.has(postingId))) throw new RgaImportError('O ID da vaga não foi conciliado. Importe a vaga ou revise a referência antes de tentar novamente.');
    const externalKeys = [
      ...(ext ? [`${source}:id:${ext}`] : []),
      ...(email ? [`${source}:email:${digest(email)}`] : []),
      ...(phone ? [`${source}:phone:${digest(phone)}`] : []),
    ];
    const known = firstMatch(externalKeys.map((key) => refId('contact', key)));
    if (known && (!contactRows.has(known) || contactRows.get(known)?.isAnonymized)) return 'duplicates';
    const matched = firstMatch([known, contactBy(emailsByValue, email), contactBy(phonesByValue, phone)]);
    const id = matched ?? recordId(ctx, fileKey, row, 'contact');
    const current = contactRows.get(id);
    if (current?.isAnonymized) return 'duplicates';
    const explicitMatch = ext && refId('contact', externalKeys[0]) === id;
    if (ext && !explicitMatch && originIdsByContact.has(id)) throw new RgaImportError('O ID de origem diverge do cadastro localizado.');
    const name = companyNameKey(f.name);
    const seenName = namedContacts.get(id);
    if ((seenName && seenName !== name) || (current && !explicitMatch && companyNameKey(current.name) !== name)) {
      throw new RgaImportError('O contato localizado por telefone ou e-mail tem outro nome. Revise a identidade.');
    }

    const historical = file.kind === 'candidate' && !postingId;
    const selectionId = file.kind === 'candidate' ? external(f.selectionId) : null;
    const selectionCompany = companyNameKey(f.companyName ?? '');
    const selectionRole = companyNameKey(f.interest ?? '');
    const selectionDate = date?.toISOString();
    const selectionKeys = file.kind === 'candidate' ? [
      ...(selectionId ? [`${SELECTION_ID_PREFIX}${selectionId}`] : []),
      ...(selectionCompany && selectionRole && selectionDate ? [`${SELECTION_PREFIX}dados:${digest(JSON.stringify([id, selectionCompany, selectionRole, selectionDate]))}`] : []),
    ] : [];
    if (historical && !selectionKeys.length) {
      throw new RgaImportError('Seleção sem referência suficiente. Mapeie um ID único da seleção ou informe empresa, cargo e data da seleção.');
    }
    const customFields = { origemPlanilha: Object.fromEntries(Object.entries({
      origem: f.source, idOrigem: ext, dataOrigem: f.createdAt, cargo: interest, experiencia: f.experience,
      bairro: f.district, salarioInformado: f.salary, salarioBRL: salary, observacao: f.notes,
      empresaInformada: f.companyName, statusInformado: f.status, entrevistaMarcada: f.interview,
      dataEntrevista: f.interviewDate, candidatoAdmitido: f.hired, envioParecer: f.feedbackSent,
      idSelecao: selectionId, dataSelecaoNormalizada: historical ? selectionDate : undefined,
    }).filter(([, value]) => value != null && value !== '')) as Prisma.InputJsonObject };
    const opening = openingKey(id, postingId ?? null);
    const opportunityRef = `${source}:${digest(JSON.stringify([externalKeys[0], postingExternal]))}`;
    const trackedOpportunity = refId('opportunity', opportunityRef);
    const matchedSelection = firstMatch(selectionKeys.map((key) => refId('opportunity', key)));
    const evidence = historical ? selectionEvidence(customFields) : null;
    let existingId: string | undefined;
    if (historical) {
      const existing = matchedSelection ? importedSelections.get(matchedSelection) : undefined;
      if (matchedSelection && !existing) return 'duplicates';
      const knownSelectionId = matchedSelection ? selectionOriginIds.get(matchedSelection) : undefined;
      if ((selectionId && knownSelectionId && selectionId !== knownSelectionId) || (existing && (existing.contactId !== id || existing.evidence !== evidence))) {
        throw new RgaImportError('Há registros divergentes para a mesma seleção. Revise o ID e os dados históricos.');
      }
      existingId = matchedSelection;
    } else {
      if (matchedSelection) throw new RgaImportError('Esta seleção já possui histórico sem vaga. Revise o vínculo no ATS antes de importar.');
      const existing = openingByContact.get(opening);
      if ((trackedOpportunity && !existing?.has(trackedOpportunity)) || seen.has(opening)) return 'duplicates';
      if (existing && existing.size > 1) throw new RgaImportError('Há mais de um processo correspondente para este candidato.');
      seen.add(opening);
      existingId = existing?.values().next().value;
    }
    namedContacts.set(id, name);
    const updates = current ? onlyMissing(current, { headline, location }) : {};
    // Preserve recruiter-edited contact details. Fill an absent channel only.
    if (current && email && !current.emails.length) updates.emails = [email];
    if (current && phone && !current.phones.length) updates.phones = [phone];
    if (!current) {
      const match = { id, name: f.name, emails: email ? [email] : [], phones: phone ? [phone] : [], headline, location, isAnonymized: false };
      write.contactNew.push({ ...match, orgId, ...(date ? { createdAt: date } : {}) });
      contactRows.set(id, match);
      indexContacts(match);
    } else if (Object.keys(updates).length) {
      write.contactUpdates.push({ id, data: updates });
      const merged = { ...current, ...updates };
      contactRows.set(id, merged);
      indexContacts(merged);
    }
    const linked = externalKeys.map((key) => setRef('contact', key, id, !current)).some(Boolean);
    if (ext) originIdsByContact.set(id, externalKeys[0]);
    const opportunityKeys = historical ? selectionKeys : [opportunityRef];
    if (!existingId) {
      const opportunityId = recordId(ctx, fileKey, row, 'opportunity');
      write.opportunityNew.push({
        id: opportunityId, orgId, contactId: id, postingId: postingId ?? null,
        stageId: stageId!, origin: 'SOURCED', source: nullable(f.source) ?? source,
        customFields, ...(date ? { createdAt: date, stageChangedAt: date } : {}),
      });
      write.stageTransitions.push({ opportunityId, toStageId: stageId!, ...(date ? { occurredAt: date } : {}) });
      if (historical) {
        importedSelections.set(opportunityId, { contactId: id, evidence });
        if (selectionId) selectionOriginIds.set(opportunityId, selectionId);
      } else openingByContact.set(opening, new Set([opportunityId]));
      for (const key of opportunityKeys) setRef('opportunity', key, opportunityId, true);
      return current && !historical ? 'updated' : 'created';
    }
    if (historical && selectionId) selectionOriginIds.set(existingId, selectionId);
    const linkedOpportunity = opportunityKeys.map((key) => setRef('opportunity', key, existingId, false)).some(Boolean);
    return linked || linkedOpportunity || Object.keys(updates).length ? 'updated' : 'duplicates';
  }

  const handler = file.kind === 'company' ? company : file.kind === 'posting' ? posting : person;
  const report: RgaImportReport = { total: parsed.records.length, created: 0, updated: 0, duplicates: 0, errors: 0, issues: [] };
  for (const { row, fields } of parsed.records) {
    try {
      if (Object.values(fields).some((field) => field.length > 12_000 || field.includes('\0'))) throw new RgaImportError('Uma célula contém caracteres inválidos ou é longa demais.');
      report[handler(fields, row)] += 1;
    } catch (error) {
      if (!(error instanceof RgaImportError)) throw error;
      report.errors += 1;
      if (report.issues.length < 100) report.issues.push({ row, message: error.message });
    }
  }
  return { report, write };
}

function seal(ctx: SessionContext, file: RgaSpreadsheet, parsed: ReturnType<typeof parseFile>, plan: Awaited<ReturnType<typeof planImport>>, expiresAt: number) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new RgaImportError('A importação requer a configuração de autenticação do ATS.');
  return createHmac('sha256', secret).update(JSON.stringify([
    ctx.orgId, ctx.userId, file.kind, file.headerRow, file.name.toLowerCase().endsWith('.xlsx'), parsed.key, parsed.assignments, expiresAt,
    plan.report, plan.write,
  ])).digest('hex');
}

async function writeImport(tx: Prisma.TransactionClient, ctx: SessionContext, file: RgaSpreadsheet, plan: Awaited<ReturnType<typeof planImport>>) {
  const { report, write } = plan;
  const org = { orgId: ctx.orgId };
  const job = await tx.importJob.create({ data: {
    ...org, provider: RGA_IMPORT_PROVIDER, accountName: importKinds[file.kind], status: 'SUCCEEDED',
    options: { kind: file.kind }, stats: { rga: report }, issueCount: report.errors,
    createdById: ctx.userId, finishedAt: new Date(),
  }, select: { id: true } });
  if (write.companyNew.length) await tx.clientCompany.createMany({ data: write.companyNew });
  for (const { id, data } of write.companyUpdates) await tx.clientCompany.updateMany({ where: { ...org, id }, data });
  if (write.postingNew.length) await tx.posting.createMany({ data: write.postingNew });
  for (const { id, data } of write.postingUpdates) await tx.posting.updateMany({ where: { ...org, id }, data });
  const optOutAt = new Date();
  if (write.contactNew.length) await tx.contact.createMany({ data: write.contactNew.map((contact) => ({ ...contact, emailOptOutAt: optOutAt })) });
  for (const { id, data } of write.contactUpdates) {
    await tx.contact.updateMany({ where: { ...org, id, isAnonymized: false }, data });
    if (data.emails) await tx.contact.updateMany({
      where: { ...org, id, isAnonymized: false, emailOptOutAt: null }, data: { emailOptOutAt: optOutAt },
    });
  }
  if (write.opportunityNew.length) await tx.opportunity.createMany({ data: write.opportunityNew });
  if (write.stageTransitions.length) await tx.stageTransition.createMany({ data: write.stageTransitions });
  if (write.refs.length) await tx.importRef.createMany({ data: write.refs.map((ref) => ({ ...ref, ...org, provider: RGA_IMPORT_PROVIDER, jobId: job.id })) });
  await emitEvent(tx, {
    ...org, ...actorOf(ctx), verb: 'import.completed', subjectType: 'import_job', subjectId: job.id,
    payload: { provider: RGA_IMPORT_PROVIDER, kind: file.kind, created: report.created, updated: report.updated, duplicates: report.duplicates, errors: report.errors },
  });
  return job.id;
}

export async function previewRgaImport(ctx: SessionContext, file: RgaSpreadsheet) {
  requireAdmin(ctx);
  const parsed = parseFile(ctx, file);
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const plan = await db.$transaction((tx) => planImport(tx, ctx, file, parsed), { isolationLevel: 'RepeatableRead', timeout: 30_000 });
  return { report: plan.report, ticket: `${expiresAt}.${seal(ctx, file, parsed, plan, expiresAt)}` };
}

export async function confirmRgaImport(ctx: SessionContext, file: RgaSpreadsheet, ticket: string) {
  requireAdmin(ctx);
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(ticket);
  if (!match || Number(match[1]) <= Date.now()) throw new RgaImportError('A prévia expirou. Gere uma nova prévia antes de confirmar.');
  const parsed = parseFile(ctx, file);
  const result = await db.$transaction(async (tx) => {
    await lockClientWrites(tx, ctx.orgId);
    const plan = await planImport(tx, ctx, file, parsed);
    const expected = seal(ctx, file, parsed, plan, Number(match[1]));
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(match[2]))) {
      throw new RgaImportError('O arquivo, o mapeamento ou os registros mudaram. Gere uma nova prévia.');
    }
    return { id: await writeImport(tx, ctx, file, plan), report: plan.report };
  }, { isolationLevel: 'Serializable', timeout: 120_000 });
  invalidateLists(ctx.orgId);
  return result;
}

export function rgaReport(stats: unknown): RgaImportReport | null {
  if (!stats || typeof stats !== 'object' || !('rga' in stats)) return null;
  const report = stats.rga;
  if (!report || typeof report !== 'object' || !('issues' in report) || !Array.isArray(report.issues)) return null;
  return report as RgaImportReport;
}
