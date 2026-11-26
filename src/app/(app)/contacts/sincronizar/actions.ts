'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { processTalentSync, requestTalentSync } from '@/server/talent-sync-run';

export async function syncTalentNow() {
  const ctx = await requireSession();
  try {
    await requestTalentSync(ctx);
    after(() => processTalentSync(ctx.orgId).catch(() => undefined));
  } catch { return { error: 'Sincronização indisponível. Confira a conexão da planilha e as permissões.' }; }
  revalidatePath('/contacts/sincronizar');
  return { ok: true };
}
