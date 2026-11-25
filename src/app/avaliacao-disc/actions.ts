'use server';

import { candidateDisc } from '@/server/native-disc';

export async function candidateDiscAction(token: string, change?: { answers: unknown; revision: number; submit: boolean }) {
  try { return await candidateDisc(token, change); }
  catch { return { error: 'Não foi possível acessar a avaliação. Tente novamente.' }; }
}
