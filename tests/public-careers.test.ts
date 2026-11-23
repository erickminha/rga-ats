import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hasDb } from './setup';
import { createOrg } from './fixtures';
import { generateMetadata as boardMetadata } from '@/app/careers/[org]/page';
import { generateMetadata as postingMetadata } from '@/app/careers/[org]/[posting]/page';
import { GET as list } from '@/app/api/careers/[org]/postings/route';
import { GET as feed } from '@/app/api/careers/[org]/feed.xml/route';
import { GET as logo } from '@/app/api/logo/[id]/route';
import { getPortalData, requestPortalLink, setNetworkConsent } from '@/server/portal';
import { submitApplication } from '@/server/applications';
import { setPostingClient, setPublicClientIdentity } from '@/server/client-companies';
import { storeFile } from '@/server/storage';
import { setPostingState } from '@/server/postings';
import { publicationDate } from '@/server/public-careers';
import { buildOpportunityVars } from '@/server/email';
import { createPortalToken } from '@/lib/portal-token';
import { formatPublicSalary, jsonLd, publicPostingText } from '@/lib/public-careers';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'careers.example.test', 'x-forwarded-proto': 'https' }),
}));
vi.mock('@/lib/auth', () => ({ auth: async () => null }));

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'public-careers-test-only'));
afterEach(() => vi.unstubAllEnvs());

const request = new Request('https://careers.example.test');

function orgParams(org: string) {
  return { params: Promise.resolve({ org }) };
}

describe('public posting copy', () => {
  it('formats only provided salary values and safely serializes posting text', () => {
    expect(formatPublicSalary(3000, 4500, 'BRL')).toMatch(/3\.000.*4\.500/);
    expect(formatPublicSalary(null, 4500, 'BRL')).toMatch(/^Até/);
    expect(formatPublicSalary(null, null, 'BRL')).toBeNull();
    expect(publicPostingText({ description: ' Atuação ', requirements: [' Organização ', 4, ''] }))
      .toEqual({ description: 'Atuação', requirements: ['Organização'] });
    expect(jsonLd({ description: '</script><script>' })).not.toContain('<');
  });
});

describe.skipIf(!hasDb)('public careers portal', () => {
  it('exposes only published jobs and approved client names and logos, including the feeds', async () => {
    const { org, admin, stages } = await createOrg();
    await db.organization.update({ where: { id: org.id }, data: { kind: 'AGENCY' } });
    const { org: other } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'SUPER_ADMIN' };
    const client = await db.clientCompany.create({ data: { orgId: org.id, name: 'Empresa Reservada', notes: 'Nota interna', cnpj: '12ABC34501DE35' } });
    const foreign = await db.clientCompany.create({ data: { orgId: other.id, name: 'Empresa de outro espaço' } });
    const replacement = await db.clientCompany.create({ data: { orgId: org.id, name: 'Cliente substituto' } });
    const image = await storeFile({ orgId: org.id, filename: 'ficticio.png', mime: 'image/png', data: Buffer.from('logo fictício') });
    const data = { orgId: org.id, title: 'Vaga fictícia', content: { description: 'Descrição publicável', requirements: ['Organização'] } };
    const published = await db.posting.create({ data: { ...data, slug: 'vaga-publica', clientCompanyId: client.id, logoFileId: image.id } });
    await setPostingState(ctx, published.id, 'PUBLISHED');
    expect(await publicationDate(org.id, published.id)).toBeInstanceOf(Date);
    await db.posting.create({ data: { ...data, slug: 'vaga-interna', state: 'INTERNAL', logoFileId: image.id } });
    await db.posting.create({ data: {
      ...data, slug: 'vaga-externa', state: 'PUBLISHED', clientCompanyId: foreign.id,
      content: { publicClientCompanyId: foreign.id },
    } });
    const params = orgParams(org.slug);
    const getLogo = () => logo(request, { params: Promise.resolve({ id: image.id }) });
    const publicMetadata = (slug: string, applied?: string) => postingMetadata({
      params: Promise.resolve({ org: org.slug, posting: slug }), searchParams: Promise.resolve({ applied, utm_source: 'fonte' }),
    });
    const person = await db.contact.create({ data: { orgId: org.id, name: 'Pessoa Fictícia' } });
    const opportunity = await db.opportunity.create({ data: { orgId: org.id, contactId: person.id, postingId: published.id, stageId: stages[0].id } });
    expect((await buildOpportunityVars(opportunity.id)).vars.company_name).toBe(org.name);
    expect((await getLogo()).status).toBe(404);
    expect((await list(request, params)).status).toBe(200);
    const hidden = await (await list(request, params)).text();
    expect(hidden).not.toMatch(/Empresa Reservada|outro espaço|Nota interna|12ABC34501DE35|vaga-interna/);
    const xml = await (await feed(request, params)).text();
    expect(xml).toContain('Confidencial');
    expect(xml).not.toMatch(/Empresa Reservada|outro espaço|vaga-interna/);
    expect((await publicMetadata('vaga-interna')).robots).toEqual({ index: false, follow: false });
    expect((await publicMetadata('vaga-publica', '1')).robots).toEqual({ index: false, follow: false });
    expect((await publicMetadata('vaga-publica')).alternates?.canonical).toBe(`https://careers.example.test/careers/${org.slug}/vaga-publica`);
    expect((await boardMetadata(params)).alternates?.canonical).toBe(`https://careers.example.test/careers/${org.slug}`);

    await expect(setPublicClientIdentity({ ...ctx, accessRole: 'TEAM_MEMBER' }, published.id, client.id, true)).rejects.toThrow(/permissão/);
    await expect(setPublicClientIdentity(ctx, published.id, foreign.id, true)).rejects.toThrow(/indisponível/);
    await setPublicClientIdentity(ctx, published.id, client.id, true);
    expect((await buildOpportunityVars(opportunity.id)).vars.company_name).toBe('Empresa Reservada');
    expect(await (await list(request, params)).text()).toContain('Empresa Reservada');
    expect(await (await feed(request, params)).text()).toContain('Empresa Reservada');
    expect((await getLogo()).status).toBe(200);
    await setPostingClient(ctx, published.id, replacement.id);
    expect((await getLogo()).status).toBe(404);
    expect(await (await list(request, params)).text()).not.toMatch(/Empresa Reservada|Cliente substituto/);
  });

  it('sends a link only for the requesting candidate and keeps optional preferences separate', async () => {
    const { org } = await createOrg();
    const { org: other } = await createOrg();
    const title = 'Analista fictício';
    const posting = await db.posting.create({ data: { slug: 'analista', title, orgId: org.id, state: 'PUBLISHED' } });
    const email = 'pessoa@example.invalid';
    const data = { orgSlug: org.slug, postingSlug: posting.slug, name: 'Pessoa Fictícia', email };
    const { contactId } = await submitApplication(data);
    await requestPortalLink(other.slug, email, request.url.slice(0, -1));
    await requestPortalLink(org.slug, 'ausente@example.invalid', request.url.slice(0, -1));
    expect(await db.emailMessage.count({ where: { orgId: { in: [org.id, other.id] } } })).toBe(0);

    await requestPortalLink(org.slug, email, 'https://careers.example.test');
    const message = await db.emailMessage.findFirstOrThrow({ where: { orgId: org.id, toEmail: email } });
    expect(message.subject).toContain('Acompanhe sua candidatura');
    const token = message.body.match(/\/portal\/([\w.-]+)/)?.[1];
    expect(token).toBeTruthy();
    const portal = await getPortalData(token!);
    expect(portal?.applications.map((app) => app.postingTitle)).toEqual([title]);
    expect(await getPortalData(createPortalToken(contactId, other.id))).toBeNull();
    expect(await getPortalData(createPortalToken(contactId, org.id, -1))).toBeNull();
    expect(await getPortalData(token! + 'bad')).toBeNull();
    expect(await getPortalData(token! + '.extra')).toBeNull();
    await setNetworkConsent(token!, true);
    const grants = await db.consentRecord.findMany({ where: { contactId, withdrawnAt: null } });
    expect(grants.map((grant) => grant.purpose)).toEqual(['APPLICATION']);
  });
});
