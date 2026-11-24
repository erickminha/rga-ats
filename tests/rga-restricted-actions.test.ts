import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, candidate } from './fixtures';
import { hasDb } from './setup';

const state = vi.hoisted(() => ({ id: '', orgId: '', accessRole: '' }));
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { ...state } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { sendEmailAction, saveCustomFieldsAction, updateContactDetailsAction, createShareLinkAction } = await import('@/app/(app)/actions');

describe.skipIf(!hasDb)('restricted server actions', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('blocks recruiting writes for both restricted roles and preserves the operator paths', async () => {
    const { org, stages, admin } = await createOrg();
    const { contact, opportunity } = await candidate(org.id, stages, [[0, 0]], { emails: ['exemplo@example.invalid'] });
    const data = new FormData();
    data.set('opportunityId', opportunity.id);
    data.set('subject', 'Assunto fictício');
    data.set('body', 'Mensagem de teste agendada');
    data.set('scheduledAt', new Date(Date.now() + 3600_000).toISOString());
    data.set('cf_ficticio', 'Valor fictício');
    await db.customFieldDef.create({ data: { orgId: org.id, label: 'Campo fictício', key: 'ficticio', type: 'TEXT' } });

    for (const accessRole of ['INTERVIEWER', 'LIMITED_TEAM_MEMBER']) {
      Object.assign(state, { id: admin.id, orgId: org.id, accessRole });
      await expect(sendEmailAction(undefined, data)).rejects.toThrow('NEXT_REDIRECT');
      await expect(saveCustomFieldsAction(opportunity.id, data)).rejects.toThrow('NEXT_REDIRECT');
      await expect(updateContactDetailsAction(opportunity.id, contact.id, { location: 'Recife' })).rejects.toThrow('NEXT_REDIRECT');
      expect(await createShareLinkAction('candidate', opportunity.id)).toHaveProperty('error');
    }
    expect(await db.emailMessage.count({ where: { orgId: org.id } })).toBe(0);
    expect((await db.opportunity.findUnique({ where: { id: opportunity.id } }))?.customFields).toBeNull();

    Object.assign(state, { id: admin.id, orgId: org.id, accessRole: 'SUPER_ADMIN' });
    await sendEmailAction(undefined, data);
    await saveCustomFieldsAction(opportunity.id, data);
    await updateContactDetailsAction(opportunity.id, contact.id, { location: 'Recife' });
    expect(await db.emailMessage.count({ where: { orgId: org.id, status: 'SCHEDULED' } })).toBe(1);
    expect((await db.opportunity.findUnique({ where: { id: opportunity.id } }))?.customFields).toEqual({ ficticio: 'Valor fictício' });
    expect((await db.contact.findUnique({ where: { id: contact.id } }))?.location).toBe('Recife');
  });
});
