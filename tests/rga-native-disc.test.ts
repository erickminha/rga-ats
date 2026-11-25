import { describe, expect, it } from 'vitest';
import { dimensions, discProfile, groups, localDiscInterpretation, provisionalKey, scoreDisc, validDraft, validatedDiscInterpretation, type Scores } from '@/lib/native-disc';

const answers = groups.map(() => [4, 3, 2, 1]);

describe('Instrumento DISC nativo', () => {
  it('preserva a estrutura e soma 100 com a chave provisória', () => {
    expect(groups).toHaveLength(10);
    expect(scoreDisc(answers, provisionalKey)).toEqual({ D: 40, I: 30, S: 20, C: 10 });
    expect(provisionalKey.version).toBe('rga-posicional-provisoria-1');
  });

  it('recusa avaliação incompleta, duplicidade, valor inválido e chave adulterada', () => {
    expect(validDraft(groups.map(() => [0, 0, 1, 0]))).toBe(true);
    for (const invalid of [[...answers.slice(1)], [[4, 3, 2, 2], ...answers.slice(1)], [[4, 3, 2, 0], ...answers.slice(1)], [[4, 3, 2, 5], ...answers.slice(1)]]) {
      expect(() => scoreDisc(invalid, provisionalKey)).toThrow();
    }
    expect(() => scoreDisc(answers, { ...provisionalKey, mapping: groups.map(() => ['D', 'D', 'S', 'C']) })).toThrow();
  });

  it('preserva as 12 combinações ordenadas e trata empates separadamente', () => {
    for (const first of dimensions) for (const second of dimensions.filter(d => d !== first)) {
      const scores = { D: 15, I: 15, S: 15, C: 15 } as Scores;
      scores[first] = 40;
      scores[second] = 30;
      expect(discProfile(scores)).toBe(first + '/' + second);
      expect(localDiscInterpretation(scores).expected.length).toBeLessThanOrEqual(400);
    }
    expect(discProfile({ D: 30, I: 30, S: 30, C: 10 })).toContain('Empate na maior pontuação');
    expect(discProfile({ D: 40, I: 20, S: 20, C: 20 })).toContain('empate na segunda');
    expect(discProfile({ D: 25, I: 25, S: 25, C: 25 })).toContain('equilibrado');
  });

  it('valida a interpretação estruturada e os limites do texto', () => {
    const valid = localDiscInterpretation({ D: 40, I: 30, S: 20, C: 10 });
    expect(validatedDiscInterpretation(valid)?.strengths).toHaveLength(3);
    expect(validatedDiscInterpretation({ ...valid, expected: 'a'.repeat(401) })).toBeNull();
    expect(validatedDiscInterpretation({ ...valid, strengths: ['Só uma'] })).toBeNull();
  });
});

import { vi } from 'vitest';
import { discAiConfiguration, saveDiscAiConfiguration } from '@/server/disc-ai-settings';
import { hasDb } from './setup';
import { candidate, createOrg } from './fixtures';
import { db } from '@/lib/db';
import { cancelDisc, candidateDisc, createDiscInvite, editDiscInterpretation, prepareDisc, reviewDisc } from '@/server/native-disc';

describe.skipIf(!hasDb)('Fluxo DISC com PostgreSQL', () => {
  it('permite configurar IA apenas a administradores e limita modelos autorizados', async () => {
    const { org, admin } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'ADMIN' };
    vi.stubEnv('RGA_ALLOW_EXTERNAL_AI', 'true');
    vi.stubEnv('RGA_DISC_AI_PROVIDERS', 'groq');
    vi.stubEnv('RGA_DISC_GROQ_TOKEN', 'ficticio');
    vi.stubEnv('RGA_DISC_GROQ_MODEL', 'modelo-teste');
    vi.stubEnv('RGA_DISC_AI_DAILY_LIMIT', '20');
    vi.stubEnv('RGA_DISC_AI_MONTHLY_LIMIT', '200');
    const form = new FormData();
    form.set('daily', '10'); form.set('monthly', '100'); form.set('slot0', 'groq|modelo-teste');
    try {
      await expect(saveDiscAiConfiguration({ ...ctx, accessRole: 'TEAM_MEMBER' }, form)).rejects.toThrow();
      await saveDiscAiConfiguration(ctx, form);
      expect(await discAiConfiguration(org.id)).toMatchObject({ daily: 10, monthly: 100, providers: [{ provider: 'groq', model: 'modelo-teste' }] });
      form.set('slot0', 'groq|modelo-nao-autorizado');
      await expect(saveDiscAiConfiguration(ctx, form)).rejects.toThrow();
    } finally { vi.unstubAllEnvs(); }
  });
  it('protege a chave provisória, salva, retoma, conclui uma vez e preserva o histórico', async () => {
    const { org, stages, admin } = await createOrg();
    const { org: other } = await createOrg();
    const posting = await db.posting.create({ data: { orgId: org.id, title: 'Vaga fictícia', slug: 'disc-ficticio' } });
    const { opportunity } = await candidate(org.id, stages, [[0, 0]], { postingId: posting.id, emails: ['pessoa@example.invalid'] });
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    vi.stubEnv('RGA_DISC_TEST_ORG_ID', org.id);
    vi.stubEnv('RGA_DISC_APPROVED_KEY', '');
    try {
      await expect(createDiscInvite(ctx, opportunity.id, 7, false)).rejects.toThrow(/aguarda validação/);
      await expect(createDiscInvite({ ...ctx, accessRole: 'INTERVIEWER' }, opportunity.id, 7, true)).rejects.toThrow();
      await expect(createDiscInvite({ ...ctx, orgId: other.id }, opportunity.id, 7, true)).rejects.toThrow();
      const cancelled = await createDiscInvite(ctx, opportunity.id, 7, true);
      const first = await db.nativeDisc.findFirstOrThrow({ where: { opportunityId: opportunity.id } });
      expect(first.tokenHash).not.toContain(cancelled.token);
      await cancelDisc({ ...ctx, orgId: other.id }, first.id);
      expect(await candidateDisc(cancelled.token)).not.toBeNull();
      await cancelDisc(ctx, first.id);
      expect(await candidateDisc(cancelled.token)).toBeNull();
      const invite = await createDiscInvite(ctx, opportunity.id, 7, true);
      const draft = groups.map((_, i) => i === 0 ? [4,3,2,1] : [0,0,0,0]);
      expect(await candidateDisc(invite.token, { answers: draft, revision: 0, submit: false })).toEqual({ saved: 1 });
      expect(await candidateDisc(invite.token)).toMatchObject({ answers: draft, revision: 1 });
      expect(await candidateDisc(invite.token, { answers: draft, revision: 0, submit: false })).toHaveProperty('error');
      expect(await candidateDisc(invite.token, { answers: draft, revision: 1, submit: true })).toHaveProperty('error');
      expect(await candidateDisc(invite.token, { answers, revision: 1, submit: true })).toEqual({ done: true });
      expect(await candidateDisc(invite.token, { answers, revision: 1, submit: true })).toEqual({ done: true });
      const row = await db.nativeDisc.findFirstOrThrow({ where: { opportunityId: opportunity.id, submittedAt: { not: null } } });
      await db.recruitingAssessment.create({ data: { opportunityId: opportunity.id, disc: { profile: 'Histórico' } } });
      expect(row.results).toMatchObject({ D: 40, provider: 'local', analysis: { profile: 'D/I' } });
      const edit = { ...localDiscInterpretation({ D: 40, I: 30, S: 20, C: 10 }), detail: 'Texto revisado pela recrutadora.' };
      await expect(editDiscInterpretation({ ...ctx, orgId: other.id }, row.id, row.revision, edit)).rejects.toThrow();
      await editDiscInterpretation(ctx, row.id, row.revision, edit);
      await expect(editDiscInterpretation(ctx, row.id, row.revision, edit)).rejects.toThrow();
      await reviewDisc(ctx, row.id);
      expect((await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: opportunity.id } })).disc).toEqual({ profile: 'Histórico' });
      expect((await db.nativeDisc.findUniqueOrThrow({ where: { id: row.id } })).results).toMatchObject({ D: 40, provider: 'manual', analysis: { detail: 'Texto revisado pela recrutadora.' } });
      expect(await db.event.count({ where: { orgId: org.id, verb: 'disc.submitted' } })).toBe(1);
      const expiring = await createDiscInvite(ctx, opportunity.id, 1, true);
      await db.nativeDisc.updateMany({ where: { opportunityId: opportunity.id, submittedAt: null }, data: { expiresAt: new Date(0) } });
      expect(await candidateDisc(expiring.token)).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
  it('tenta o próximo provedor autorizado e registra apenas metadados e interpretação validada', async () => {
    const { org, stages, admin } = await createOrg();
    const posting = await db.posting.create({ data: { orgId: org.id, title: 'Vaga de teste IA', slug: 'disc-teste-ia' } });
    const { opportunity } = await candidate(org.id, stages, [[0, 0]], { postingId: posting.id, name: 'Nome fictício omitido' });
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    vi.stubEnv('RGA_DISC_APPROVED_KEY', JSON.stringify({ ...provisionalKey, version: 'aprovada-apenas-no-teste', reference: 'documento fictício' }));
    vi.stubEnv('RGA_ALLOW_EXTERNAL_AI', 'true');
    vi.stubEnv('RGA_DISC_AI_PROVIDERS', 'groq,openai');
    vi.stubEnv('RGA_DISC_AI_DAILY_LIMIT', '2');
    vi.stubEnv('RGA_DISC_AI_MONTHLY_LIMIT', '2');
    for (const provider of ['GROQ', 'OPENAI']) {
      vi.stubEnv('RGA_DISC_' + provider + '_TOKEN', 'segredo-fictício');
      vi.stubEnv('RGA_DISC_' + provider + '_MODEL', 'modelo-fictício');
    }
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: JSON.stringify(localDiscInterpretation({ D: 40, I: 30, S: 20, C: 10 })) } }], usage: { total_tokens: 200 },
    }));
    vi.stubGlobal('fetch', fetcher);
    try {
      for (let i = 0; i < 2; i++) {
        const { token } = await createDiscInvite(ctx, opportunity.id, 7, false);
        await candidateDisc(token, { answers, revision: 0, submit: true });
        const row = await db.nativeDisc.findFirstOrThrow({ where: { opportunityId: opportunity.id, reviewedAt: null } });
        await prepareDisc(ctx, row.id);
      await reviewDisc(ctx, row.id);
        const saved = await db.nativeDisc.findUniqueOrThrow({ where: { id: row.id } });
        expect(saved.results).toMatchObject(i === 0 ? { provider: 'openai', model: 'modelo-fictício', tokens: 200 } : { provider: 'openai', model: 'modelo-fictício', tokens: 0, cached: true });
      }
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0][1].body).not.toContain('Nome fictício omitido');
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

});
