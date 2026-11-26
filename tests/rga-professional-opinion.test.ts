import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createPosting, setPostingState } from '@/server/postings';
import { moveStage } from '@/server/opportunities';
import { saveRecruitingAssessment } from '@/server/recruiting-assessment';
import { makeOpinionPdf } from '@/server/opinion-pdf';
import { eraseCandidateData } from '@/server/retention';
import { saveCustomerFeedback, saveOpinionTemplate } from '@/server/professional-opinion';
import { createShortlistShare, readShortlistShare, recordShortlistSend, resolveShare, revokeRecruitingShares } from '@/server/share-links';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};

it('uses A4, paginates long sections and preserves Portuguese', async () => {
  const bytes = await makeOpinionPdf({ metadata: { candidate: 'Profissional Fictício', organization: 'RGA Consultoria de RH',
    author: 'Recrutadora Fictícia', posting: 'Técnico em eletrônica', client: 'Empresa Fictícia' },
    issuedAt: new Date('2026-11-24T12:00:00Z'), version: 2,
    content: { education: ('A formação técnica em eletrônica inclui organização, comunicação e atenção.\n\n').repeat(75),
      recommendation: 'Recomendação confirmada.' } });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(2);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
  const result = await extractText(bytes, { mergePages: true });
  expect(result.text).toContain('formação técnica em eletrônica');
  expect(result.text).toContain('Recomendação confirmada');
});

describe.skipIf(!hasDb)('pareceres e apresentações', () => {
  it('preserves the issued revision, limits document access and keeps feedback separate from hiring', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    await expect(saveOpinionTemplate(ctx, form({ name: 'Fictício' }))).rejects.toThrow('administradores');
    await saveOpinionTemplate({ ...ctx, accessRole: 'ADMIN' }, form({ name: 'Modelo fictício', section: 'education' }));
    const settings = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(settings.opinionTemplate).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Modelo fictício', sections: ['education', 'recommendation'] })]));
    const client = await db.clientCompany.create({ data: { orgId: org.id, name: 'Cliente Fictício' } });
    const job = await createPosting(ctx, { title: 'Vaga fictícia', workplaceType: 'REMOTE', commitment: 'FULL_TIME', clientCompanyId: client.id });
    await setPostingState(ctx, job.id, 'PUBLISHED');
    await db.stage.update({ where: { id: stages[2].id }, data: { name: 'Pessoas em apresentação', operationalRole: 'FINALIST' } });
    const contact = await db.contact.create({ data: { orgId: org.id, name: 'Candidata Fictícia', emails: [], phones: [], tags: [] } });
    const row = await db.opportunity.create({ data: { orgId: org.id, contactId: contact.id, postingId: job.id, stageId: stages[2].id, origin: 'SOURCED' } });
    const save = (text: string, intent = 'finalize') => saveRecruitingAssessment(ctx, row.id, 'opinion', form({
      recommendation: text, history: 'Experiência profissional confirmada. Contato de referência: terceiro@example.invalid ou (11) 90000-0001.', concerns: 'Anotação reservada', intent,
    }));
    await expect(saveRecruitingAssessment(ctx, row.id, 'opinion', form({ complementary: 'Registro sem contexto' })))
      .rejects.toThrow('finalidade profissional');
    await saveRecruitingAssessment(ctx, row.id, 'opinion', form({ complementary: 'Resultado mínimo fictício',
      verificationPurpose: 'Finalidade profissional fictícia', verificationAuthorization: 'Registro fictício',
      verificationBasis: 'Fundamento de teste', recommendation: 'Revisão por pessoa responsável' }));
    expect((await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: row.id } })).opinion)
      .toMatchObject({ _verificationPurpose: 'Finalidade profissional fictícia' });
    await save('Primeira versão', 'draft');
    await expect(createShortlistShare(ctx, job.id, [row.id], [], { pdf: [row.id] })).rejects.toThrow('finalizados');
    await save('Primeira versão');
    await expect(createShortlistShare(ctx, job.id, [row.id], [], { resumes: [row.id] })).rejects.toThrow('Documento indisponível');
    const { code, recordId } = await createShortlistShare(ctx, job.id, [row.id], [], { pdf: [row.id] });
    expect((await db.shareLink.findUniqueOrThrow({ where: { code: recordId } })).sentAt).toBeNull();
    await expect(recordShortlistSend({ ...ctx, accessRole: 'INTERVIEWER' }, job.id, recordId)).rejects.toThrow('perfil');
    const { org: other } = await createOrg();
    await expect(recordShortlistSend({ ...ctx, orgId: other.id }, job.id, recordId)).rejects.toThrow('indisponível');
    await Promise.all([recordShortlistSend(ctx, job.id, recordId), recordShortlistSend(ctx, job.id, recordId)]);
    expect((await db.shareLink.findUniqueOrThrow({ where: { code: recordId } })).sentAt).toBeInstanceOf(Date);
    expect(await db.event.count({ where: { orgId: org.id, verb: 'shortlist.sent_manually' } })).toBe(1);
    const publicResult = async () => {
      const payload = await resolveShare(code);
      return payload ? (await readShortlistShare(payload))?.finalists[0] : null;
    };
    expect((await publicResult())?.opinion).toBeNull();
    expect((await publicResult())?.opinionPdf?.content.recommendation).toBe('Primeira versão');
    expect(JSON.stringify(await publicResult())).not.toMatch(/Anotação reservada|terceiro@example.invalid|90000-0001/);
    await save('Segunda versão');
    const versions = await db.professionalOpinionVersion.findMany({ where: { opportunityId: row.id }, orderBy: { version: 'asc' } });
    expect(versions.map(({ content }) => content)).toMatchObject([{ recommendation: 'Primeira versão' }, { recommendation: 'Segunda versão' }]);
    expect((await publicResult())?.opinionPdf).toBeNull();
    await expect(saveCustomerFeedback({ ...ctx, accessRole: 'INTERVIEWER' }, job.id, row.id, form({ status: 'APPROVED' }))).rejects.toThrow('perfil');
    await saveCustomerFeedback(ctx, job.id, row.id, form({ status: 'APPROVED', notes: 'Retorno fictício' }));
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('ACTIVE');
    expect((await db.recruitingAssessment.findUniqueOrThrow({ where: { opportunityId: row.id } })).clientFeedback)
      .toMatchObject([{ status: 'APPROVED', by: ctx.userId, clientId: client.id }]);
    await revokeRecruitingShares(ctx, 'shortlist', job.id);
    await expect(recordShortlistSend(ctx, job.id, recordId)).rejects.toThrow('indisponível');
    expect(await publicResult()).toBeNull();
    const remaining = await createShortlistShare(ctx, job.id, [row.id], [], { pdf: [row.id] });
    const hiring = await db.stage.create({ data: { orgId: org.id, name: 'Contratação', type: 'HIRED', order: 20 } });
    await moveStage(ctx, row.id, hiring.id, { requireHireDate: true, hireDate: '2025-01-15' });
    expect(await db.opportunity.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: 'HIRED', hiredAt: new Date('2025-01-15T00:00:00.000Z'),
    });
    await db.opportunity.update({ where: { id: row.id }, data: { status: 'ARCHIVED' } });
    await eraseCandidateData({ ...ctx, accessRole: 'ADMIN' }, contact.id);
    expect(await db.professionalOpinionVersion.count({ where: { opportunityId: row.id } })).toBe(0);
    expect((await resolveShare(remaining.code))?.selection?.candidates).toEqual([]);
  });
});
