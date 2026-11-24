import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { archiveOpportunity } from '@/server/opportunities';
import { attachTalentResume, recordTalentPreference, saveTalentProfile, selectTalentResume } from '@/server/talent-profile';
import { searchTalents, talentIndicators } from '@/server/talent-search';
import { reuseTalents } from '@/server/talent-reuse';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

function form(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, value);
  return data;
}

describe.skipIf(!hasDb)('busca e reaproveitamento no banco de talentos', () => {
  it('busca por currículo sem acentos, combina filtros e reaproveita sem perder a versão antiga', async () => {
    const { org, stages, admin } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const person = await saveTalentProfile(ctx, null, form({
      name: 'Pessoa fictícia', location: 'Manaus', state: 'AM', skills: 'Mecânica', education: 'Formação técnica',
      salary: '3.500,00', availability: 'IMMEDIATE', phone: '(92) 98765-4321',
    }));
    const first = await attachTalentResume(ctx, person.id, { filename: 'anterior.txt', data: Buffer.from('Técnico em eletrônica. Manutenção de equipamentos.') });
    await db.contact.update({ where: { id: person.id }, data: { tags: ['CNH B'] } });
    const pool = await db.talentPool.create({ data: { orgId: org.id, name: 'Industrial fictício', kind: 'STATIC', members: { connect: { id: person.id } } } });
    const segment = await db.talentPool.create({ data: { orgId: org.id, name: 'Manaus fictício', kind: 'DYNAMIC', rules: { advanced: true, city: 'manaus', skill: 'mecanica' } } });
    expect((await searchTalents(ctx, { q: 'TECNICO EM ELETRONICA', state: 'AM', salary: '4.000', tag: 'cnh b', availability: 'IMMEDIATE' }, { poolId: pool.id })).rows.map((c) => c.id)).toEqual([person.id]);
    expect((await searchTalents(ctx, { q: '92987654321', eligibility: 'UNKNOWN' }, { poolId: segment.id })).rows.map((c) => c.id)).toEqual([person.id]);

    const mk = (slug: string) => db.posting.create({ data: { orgId: org.id, slug, title: 'Vaga fictícia' } });
    const [a, b] = await Promise.all([mk('vaga-a'), mk('vaga-b')]);
    const pick = { id: person.id, fileId: first };
    expect(await reuseTalents(ctx, a.id, stages[0].id, [pick])).toMatchObject({ created: 0, unavailable: 1 });
    await recordTalentPreference(ctx, person.id, true);
    const attempts = await Promise.all([
      reuseTalents(ctx, a.id, stages[0].id, [pick]),
      reuseTalents(ctx, a.id, stages[0].id, [pick]),
    ]);
    expect(attempts.reduce((n, x) => n + x.created, 0)).toBe(1);
    expect(attempts.reduce((n, x) => n + x.alreadyLinked, 0)).toBe(1);
    const prior = await db.opportunity.findFirstOrThrow({ where: { orgId: org.id, postingId: a.id, contactId: person.id } });
    const reason = await db.archiveReason.create({ data: { orgId: org.id, name: 'Desistência fictícia', category: 'WITHDRAWAL', countsAsRejection: false } });
    await archiveOpportunity(ctx, prior.id, reason.id);
    const second = await attachTalentResume(ctx, person.id, { filename: 'atual.txt', data: Buffer.from('Currículo fictício atualizado. Experiência industrial.') });
    await selectTalentResume(ctx, person.id, second);
    expect((await searchTalents(ctx, { q: 'tecnico em eletronica', history: 'YES', active: 'NO', eligibility: 'YES' })).rows.map((c) => c.id)).toEqual([person.id]);
    expect(await reuseTalents(ctx, b.id, stages[0].id, [{ id: person.id, fileId: second }])).toMatchObject({ created: 1 });
    expect(await db.opportunity.findMany({ where: { contactId: person.id } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ postingId: a.id, applicationResumeId: first, status: 'ARCHIVED' }),
      expect.objectContaining({ postingId: b.id, applicationResumeId: second, status: 'ACTIVE' }),
    ]));
    expect(await db.contact.count({ where: { orgId: org.id } })).toBe(1);
    expect(await db.emailMessage.count({ where: { orgId: org.id } })).toBe(0);
    expect((await talentIndicators(ctx)).counts).toMatchObject({ total: 1, resumes: 1, recent: 1, active: 1 });
  });

  it('isola tenants, bloqueia perfis limitados e nunca encontra cadastros anonimizados', async () => {
    const home = await createOrg();
    const foreign = await createOrg();
    const ctx = { orgId: home.org.id, userId: home.admin.id, accessRole: 'TEAM_MEMBER' };
    const [other, erased] = await Promise.all([
      db.contact.create({ data: { orgId: foreign.org.id, name: 'Marcador fictício' } }),
      db.contact.create({ data: { orgId: home.org.id, name: 'Marcador fictício', isAnonymized: true } }),
    ]);
    expect((await searchTalents(ctx, { q: 'marcador' })).rows).toEqual([]);
    await expect(searchTalents({ ...ctx, accessRole: 'INTERVIEWER' }, {})).rejects.toThrow();
    const post = await db.posting.create({ data: { orgId: home.org.id, slug: 'vaga', title: 'Vaga fictícia' } });
    expect(await reuseTalents(ctx, post.id, home.stages[0].id, [{ id: other.id }, { id: erased.id }])).toMatchObject({ created: 0, unavailable: 2 });
    await expect(reuseTalents(ctx, post.id, home.stages.at(-1)!.id, [{ id: erased.id }])).rejects.toThrow('etapa inicial');
  });

  it('pagina cadastros mesmo quando têm a mesma data de atualização', async () => {
    const { org, admin } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    await db.contact.createMany({ data: Array.from({ length: 36 }, (_, i) => ({
      orgId: org.id, name: `Pessoa fictícia ${i}`, updatedAt: new Date('2026-01-01T00:00:00Z'),
    })) });
    const a = await searchTalents(ctx, { q: 'PESSOA FICTICIA' });
    const b = await searchTalents(ctx, { q: 'PESSOA FICTICIA' }, { after: a.next });
    expect(a.rows).toHaveLength(30);
    expect(b.rows).toHaveLength(6);
    expect(new Set([...a.rows, ...b.rows].map((row) => row.id)).size).toBe(36);
  });
});
