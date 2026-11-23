import { describe, expect, it } from 'vitest';
import { approvalError, dashboard } from '@/lib/i18n/pt-BR/dashboard';
import { askError, searchBox } from '@/lib/i18n/pt-BR/navigation';

describe('dashboard and navigation copy', () => {
  it('uses Brazilian grouping and handles empty and singular counts', () => {
    expect(dashboard.upcoming(0)).toBe('0 entrevistas agendadas');
    expect(dashboard.upcoming(1)).toBe('1 entrevista agendada');
    expect(dashboard.upcoming(1234)).toBe('1.234 entrevistas agendadas');
    expect(dashboard.candidateCount(1)).toBe('1 candidato na sua rede');
    expect(dashboard.candidateCount(1234)).toBe('1.234 candidatos na sua rede');
  });

  it('greets a user without exposing the previous English placeholder', () => {
    expect(dashboard.greeting('Ana')).toBe('Olá, Ana!');
    expect(dashboard.greeting('')).toBe('Olá!');
  });

  it('localizes approval states and failures without changing action values', () => {
    expect(dashboard.approvals.subjects.POSTING).toBe('Vaga');
    expect(approvalError('Admins only.')).toBe(dashboard.approvals.adminOnly);
    expect(approvalError('Approval request not found')).toBe(dashboard.approvals.notFound);
    expect(approvalError('unclassified failure')).toBe(dashboard.approvals.failed);
  });

  it('localizes the search validation and its unknown-error fallback', () => {
    expect(askError('Ask a fuller question.')).toBe(searchBox.fullerQuestion);
    expect(askError('provider failure')).toBe(searchBox.failed);
  });
});
