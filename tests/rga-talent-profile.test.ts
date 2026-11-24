import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { attachTalentResume, recordTalentPreference, saveTalentProfile, selectTalentResume } from '@/server/talent-profile';
import { findDuplicates, mergeContacts } from '@/server/contacts';
import { createOrg } from './fixtures';
import { hasDb } from './setup';

const fields = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [field, data] of Object.entries(values)) form.set(field, data);
  return form;
};

describe.skipIf(!hasDb)('banco de talentos', () => {
  it('cadastra sem vaga e troca o currículo principal preservando o utilizado nas participações anteriores', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const person = await saveTalentProfile(ctx, null, fields({
      name: 'Pessoa fictícia', email: 'FICTICIO@example.invalid', headline: 'Técnico em eletrônica',
      location: 'Manaus', state: 'AM', salary: '3.500,00', phone: '(92) 98765-4321',
    }));
    expect(person).toMatchObject({ emails: ['ficticio@example.invalid'], salaryExpectation: 350000 });
    expect(await db.opportunity.count({ where: { contactId: person.id } })).toBe(0);
    await expect(saveTalentProfile(ctx, null, fields({ name: 'Outro exemplo', phone: '+55 92 98765 4321' }))).rejects.toThrow('Já existe');
    const upload = (filename: string, text: string) => attachTalentResume(ctx, person.id, { filename, data: Buffer.from(text) });
    const original = await upload('original.txt', 'Experiência fictícia, manutenção de circuitos.');
    const opportunity = await db.opportunity.create({ data: { orgId: org.id, contactId: person.id, stageId: stages[0].id } });
    const next = await upload('novo.txt', 'Currículo fictício atualizado, área industrial.');
    await selectTalentResume(ctx, person.id, next);
    expect(await db.opportunity.findUnique({ where: { id: opportunity.id } })).toMatchObject({ applicationResumeId: original });
    expect(await db.contact.findUnique({ where: { id: person.id } })).toMatchObject({ resumeFileId: next });
    expect(await db.storedFile.findUnique({ where: { id: original } })).toMatchObject({ uploadedById: admin.id, resumeVersion: true });
    await expect(selectTalentResume({ ...ctx, accessRole: 'INTERVIEWER' }, person.id, original)).rejects.toThrow();
    const foreign = await createOrg();
    await expect(selectTalentResume({ ...ctx, orgId: foreign.org.id }, person.id, next)).rejects.toThrow('indisponível');
    await recordTalentPreference(ctx, person.id, true);
    await recordTalentPreference(ctx, person.id, false);
    expect(await db.consentRecord.count({ where: { contactId: person.id, withdrawnAt: null } })).toBe(0);
  });

  it('sugere nome semelhante para revisão e preserva o currículo da outra participação na unificação', async () => {
    const { org, admin, stages } = await createOrg();
    const ctx = { orgId: org.id, userId: admin.id, accessRole: 'TEAM_MEMBER' };
    const one = await saveTalentProfile(ctx, null, fields({ name: 'Nome Fictício' }));
    const other = await saveTalentProfile(ctx, null, fields({ name: 'NOME FICTÍCIO' }));
    expect(await findDuplicates(org.id, one)).toEqual([expect.objectContaining({ id: other.id })]);
    const oldFile = await attachTalentResume(ctx, other.id, { filename: 'outro.txt', data: Buffer.from('Documento fictício de exemplo.') });
    const opportunity = await db.opportunity.create({ data: { orgId: org.id, contactId: other.id, stageId: stages[0].id } });
    await mergeContacts(ctx, one.id, other.id);
    expect(await db.opportunity.findUnique({ where: { id: opportunity.id } })).toMatchObject({ contactId: one.id, applicationResumeId: oldFile });
  });
});
