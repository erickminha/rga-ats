import { lockPostingForEdit, mayEditPostingDetails } from '@/server/posting-policy';
import { postingContent, publicClientName } from '@/lib/public-careers';
import { Prisma, type PostingState } from '@prisma/client';
import { db } from '@/lib/db';
import { cnpjKey, companyNameKey, parseCommercialContact, parseCompany } from '@/lib/client-company';
import { isAdmin, type SessionContext } from '@/lib/session';
import { actorOf, emitEvent } from '@/server/events';
import { invalidateListMeta } from '@/server/lists/cache';

export class ClientCompanyError extends Error {}

export async function canViewClientCompanies(ctx: SessionContext) {
  if (!isAdmin(ctx) && ctx.accessRole !== 'TEAM_MEMBER') return false;
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { kind: true } });
  return org?.kind === 'AGENCY';
}

async function assertAccess(ctx: SessionContext) {
  if (!(await canViewClientCompanies(ctx))) {
    throw new ClientCompanyError('Você não tem permissão para esta operação.');
  }
}

// Serialize name checks with the legacy bulk-create flow inside this organization.
export async function lockClientWrites(tx: Prisma.TransactionClient, orgId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${orgId} FOR NO KEY UPDATE`;
}

function pageNumber(value?: string) {
  return /^[1-9]\d{0,5}$/.test(value ?? '') ? Number(value) : 1;
}

const pageSize = 25;

export async function listClientCompanies(ctx: SessionContext, filters: { q?: string; status?: string; segment?: string; page?: string }) {
  await assertAccess(ctx);
  const q = filters.q?.trim().slice(0, 180) ?? '';
  const segment = filters.segment?.trim().slice(0, 180) ?? '';
  const status = filters.status === 'active' || filters.status === 'inactive' ? filters.status : '';
  const cnpj = q && /^[A-Z0-9./ -]+$/i.test(q) && /\d/.test(q) ? cnpjKey(q) : q;
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
  const where: Prisma.ClientCompanyWhereInput = {
    orgId: ctx.orgId,
    ...(status ? { active: status === 'active' } : {}),
    ...(segment ? { segment } : {}),
    ...(q ? { OR: [{ name: contains(q) }, { legalName: contains(q) }, { city: contains(q) }, { cnpj: contains(cnpj) }] } : {}),
  };
  const [total, segments] = await Promise.all([
    db.clientCompany.count({ where }),
    db.clientCompany.findMany({
      where: { orgId: ctx.orgId, segment: { not: null } }, select: { segment: true },
      distinct: ['segment'], orderBy: { segment: 'asc' },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageNumber(filters.page), pages);
  const rows = await db.clientCompany.findMany({
    where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, name: true, legalName: true, city: true, state: true, cnpj: true, segment: true, active: true },
  });
  return { rows, total, page, pages, q, status, segment, segments: segments.flatMap((item) => item.segment ? [item.segment] : []) };
}

export async function getClientCompany(ctx: SessionContext, id: string) {
  await assertAccess(ctx);
  return db.clientCompany.findFirst({
    where: { orgId: ctx.orgId, id },
    include: { commercialContacts: { orderBy: { name: 'asc' } } },
  });
}

export async function clientPostingHistory(ctx: SessionContext, id: string, pageValue?: string) {
  await assertAccess(ctx);
  const where = { orgId: ctx.orgId, clientCompanyId: id };
  const [byState, withActiveProcesses] = await Promise.all([
    db.posting.groupBy({ by: ['state'], where, _count: { _all: true } }),
    db.posting.count({
      where: { ...where, opportunities: { some: { orgId: ctx.orgId, status: 'ACTIVE' } } },
    }),
  ]);
  const total = byState.reduce((sum, row) => sum + row._count._all, 0);
  const count = (state: PostingState) => byState.find((row) => row.state === state)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageNumber(pageValue), pages);
  const postings = await db.posting.findMany({
    where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, title: true, state: true, createdAt: true },
  });
  const changes = await db.event.findMany({
    where: {
      orgId: ctx.orgId, subjectType: 'posting', verb: 'posting.client_changed',
      payload: { path: ['previousClientCompanyId'], equals: id },
    },
    select: { id: true, subjectId: true, occurredAt: true },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: pageSize,
  });
  const previousPostings = changes.length ? await db.posting.findMany({
    where: { orgId: ctx.orgId, id: { in: changes.map((change) => change.subjectId) } },
    select: { id: true, title: true },
  }) : [];
  const titles = new Map(previousPostings.map(({ id, title }) => [id, title]));
  const previous = changes.map((change) => ({ ...change, title: titles.get(change.subjectId) ?? null }));
  return { page, pages, postings, open: count('PUBLISHED'), closed: count('CLOSED'), withActiveProcesses, previous };
}

export async function saveClientCompany(ctx: SessionContext, id: string | null, data: ReturnType<typeof parseCompany>) {
  await assertAccess(ctx);
  try {
    const saved = await db.$transaction(async (tx) => {
      await lockClientWrites(tx, ctx.orgId);
      const existing = await tx.clientCompany.findMany({
        where: { orgId: ctx.orgId }, select: { id: true, name: true, legalName: true, cnpj: true },
      });
      if (id && !existing.some((item) => item.id === id)) throw new ClientCompanyError('Empresa não encontrada.');
      const names = [data.name, data.legalName].flatMap((name) => name ? [companyNameKey(name)] : []);
      const duplicates = existing.filter((item) => item.id !== id);
      if (data.cnpj && duplicates.some((item) => item.cnpj === data.cnpj)) {
        throw new ClientCompanyError('Já existe uma empresa com este CNPJ.');
      }
      // Allow editing legacy collisions until their identifiers can be reconciled.
      const previous = existing.find((item) => item.id === id);
      const previousNames = [previous?.name, previous?.legalName].flatMap((name) => name ? [companyNameKey(name)] : []);
      const addedNames = names.filter((name) => !previousNames.includes(name));
      if (duplicates.some((item) => [item.name, item.legalName].some((name) => name && addedNames.includes(companyNameKey(name))))) {
        throw new ClientCompanyError('Já existe uma empresa com este nome ou razão social.');
      }
      const company = id
        ? await tx.clientCompany.update({ where: { id, orgId: ctx.orgId }, data })
        : await tx.clientCompany.create({ data: { ...data, orgId: ctx.orgId } });
      await emitEvent(tx, {
        orgId: ctx.orgId, ...actorOf(ctx), verb: id ? 'client_company.updated' : 'client_company.created',
        subjectType: 'client_company', subjectId: company.id, payload: { name: company.name, active: company.active },
      });
      return company;
    });
    invalidateListMeta(ctx.orgId);
    return saved;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ClientCompanyError('Já existe uma empresa com este nome ou CNPJ.');
    }
    throw error;
  }
}

export async function saveCommercialContact(
  ctx: SessionContext, clientId: string, contactId: string | null, data: ReturnType<typeof parseCommercialContact>,
) {
  await assertAccess(ctx);
  return db.$transaction(async (tx) => {
    await lockClientWrites(tx, ctx.orgId);
    const client = await tx.clientCompany.findFirst({
      where: { id: clientId, orgId: ctx.orgId }, select: { id: true },
    });
    if (!client) throw new ClientCompanyError('Empresa não encontrada.');
    const existing = await tx.clientCompanyContact.findMany({ where: { clientCompanyId: client.id } });
    if (contactId && !existing.some((item) => item.id === contactId)) throw new ClientCompanyError('Contato não encontrado.');
    if (existing.some((item) => item.id !== contactId && (data.email
      ? item.email?.toLowerCase() === data.email.toLowerCase()
      : companyNameKey(item.name) === companyNameKey(data.name)))) {
      throw new ClientCompanyError('Este contato já está cadastrado na empresa.');
    }
    if (contactId) return tx.clientCompanyContact.update({ where: { id: contactId, clientCompanyId: client.id }, data });
    return tx.clientCompanyContact.create({ data: { ...data, clientCompanyId: client.id } });
  });
}

export async function setPostingClient(ctx: SessionContext, postingId: string, clientId: string | null) {
  await assertAccess(ctx);
  const posting = await db.$transaction(async (tx) => {
    await lockClientWrites(tx, ctx.orgId);
    const current = await lockPostingForEdit(tx, ctx, postingId);
    if (!current) throw new ClientCompanyError('Vaga não encontrada.');
    if (current.clientCompanyId === clientId) return { id: current.id, clientCompanyId: current.clientCompanyId, content: current.content };
    if (!mayEditPostingDetails(ctx, current.state, current.org.requirePostingApproval)) {
      throw new ClientCompanyError('Somente administradores podem editar vagas publicadas quando a aprovação está ativa.');
    }
    if (clientId && !(await tx.clientCompany.findFirst({
      where: { id: clientId, orgId: ctx.orgId, active: true }, select: { id: true },
    }))) throw new ClientCompanyError('Selecione uma empresa ativa do seu espaço de trabalho.');
    const { publicClientCompanyId, publicClientLogoId, ...content } = postingContent(current.content);
    const updated = await tx.posting.update({
      where: { id: postingId, orgId: ctx.orgId },
      data: {
        clientCompanyId: clientId,
        ...(publicClientCompanyId || publicClientLogoId ? { content: content as Prisma.InputJsonObject } : {}),
        ...(current.clientCompanyId ? { logoFileId: null } : {}),
      },
    });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'posting.client_changed', subjectType: 'posting', subjectId: updated.id,
      payload: { previousClientCompanyId: current.clientCompanyId, clientCompanyId: clientId },
    });
    return updated;
  });
  invalidateListMeta(ctx.orgId);
  return posting;
}

export async function setPublicClientIdentity(ctx: SessionContext, postingId: string, clientId: string, enabled: boolean) {
  if (!isAdmin(ctx)) throw new ClientCompanyError('Somente administradores têm permissão para autorizar a divulgação do cliente.');
  await assertAccess(ctx);
  return db.$transaction(async (tx) => {
    await lockClientWrites(tx, ctx.orgId);
    const posting = await tx.posting.findFirst({
      where: { id: postingId, orgId: ctx.orgId, clientCompanyId: clientId },
      select: {
        orgId: true, logoFileId: true, content: true, org: { select: { slug: true } },
        clientCompany: { select: { id: true, name: true, orgId: true } },
      },
    });
    if (!posting || posting.clientCompany?.orgId !== ctx.orgId) throw new ClientCompanyError('Empresa vinculada indisponível.');
    const content = {
      ...postingContent(posting.content),
      publicClientCompanyId: enabled ? clientId : null,
      publicClientLogoId: enabled ? posting.logoFileId : null,
    } as Prisma.InputJsonObject;
    await tx.posting.update({ where: { id: postingId, orgId: ctx.orgId }, data: { content } });
    await emitEvent(tx, {
      orgId: ctx.orgId, ...actorOf(ctx), verb: 'posting.client_disclosure_changed', subjectType: 'posting', subjectId: postingId,
      payload: { clientCompanyId: clientId, enabled, wasEnabled: !!publicClientName(posting) },
    });
    return posting.org.slug;
  });
}
