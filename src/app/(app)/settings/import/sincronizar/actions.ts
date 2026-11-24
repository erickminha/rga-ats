'use server';

import { requireSession } from '@/lib/session';
import { syncTalentBatch } from '@/server/imports/rga-talent-sync';
import { RgaImportError } from '@/server/imports/rga-spreadsheet';

export async function syncTalentsAction(mode: 'preview' | 'confirm', ticket: string | null, retry: boolean) {
  const ctx = await requireSession();
  if (mode !== 'preview' && mode !== 'confirm') return { error: 'Operação inválida.' } as const;
  try { return { result: await syncTalentBatch(ctx, mode, ticket ?? undefined, retry === true) } as const; }
  catch (error) { return { error: error instanceof RgaImportError ? error.message : 'Falha na leitura ou gravação. Confira a configuração da integração e tente novamente.' } as const; }
}
