'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { processTalentSummaries, requestTalentSummary, reviewTalentSummary } from '@/server/talent-summary';

export async function generateTalentSummary(id: string, form: FormData) {
  const ctx = await requireSession();
  try {
    if (form.get('intent') === 'review') await reviewTalentSummary(ctx, id, String(form.get('summary') ?? ''));
    else {
      await requestTalentSummary(ctx, id);
      after(() => processTalentSummaries(ctx.orgId).catch(() => undefined));
    }
    revalidatePath('/contacts/' + id);
    return { ok: true as const };
  } catch { return { error: 'Operação indisponível. Confira a autorização vigente e seus acessos.' }; }
}
