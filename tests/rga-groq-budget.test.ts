import { afterEach, describe, expect, it, vi } from 'vitest';
import { reserveGroq } from '@/server/groq-budget';
import { reserveRequest, settleReservedRequest } from '@/server/request-limit';

vi.mock('@/server/request-limit', () => ({
  reserveRequest: vi.fn(),
  settleReservedRequest: vi.fn(),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('Orçamento compartilhado Groq', () => {
  function configure() {
    vi.stubEnv('RGA_GROQ_DAILY_REQUESTS', '900');
    vi.stubEnv('RGA_GROQ_DAILY_TOKENS', '180000');
  }

  it('ajusta os tokens apenas uma vez quando a resposta informa o uso real', async () => {
    configure();
    vi.mocked(reserveRequest).mockResolvedValue(true);
    const reservation = await reserveGroq('teste', 450);
    expect(reservation).not.toBeNull();
    const identity = vi.mocked(reserveRequest).mock.calls[1][1];
    expect(vi.mocked(reserveRequest).mock.calls[1][4]).toBe(711);
    await reservation?.settle(null);
    expect(settleReservedRequest).not.toHaveBeenCalled();
    await reservation?.settle(151);
    await reservation?.settle(151);
    expect(settleReservedRequest).toHaveBeenCalledTimes(1);
    expect(settleReservedRequest).toHaveBeenCalledWith('rga-groq-global-tokens', identity, 711, 151);
  });

  it('devolve a reserva de requisição se não houver saldo de tokens', async () => {
    configure();
    vi.mocked(reserveRequest).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await reserveGroq('teste', 450)).toBeNull();
    expect(settleReservedRequest).toHaveBeenCalledWith('rga-groq-global-requests', expect.any(Array), 1, 0);
  });

  it('não habilita a geração externa de resumos sem orçamento definido', async () => {
    vi.stubEnv('RGA_GROQ_DAILY_REQUESTS', '');
    vi.stubEnv('RGA_GROQ_DAILY_TOKENS', '');
    vi.stubEnv('RGA_SUMMARY_ALLOW_GROQ', 'true');
    expect(await reserveGroq('teste', 450)).toBeNull();
    expect(reserveRequest).not.toHaveBeenCalled();
  });
});
