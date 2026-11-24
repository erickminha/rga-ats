'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import type { RgaImportKind } from '@/lib/rga-import';
import { confirmRgaImport, inspectRgaSpreadsheet, previewRgaImport, RgaImportError } from '@/server/imports/rga-spreadsheet';

async function read(form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) throw new RgaImportError('Selecione um CSV ou XLSX de até 4 MB.');
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

export async function runSpreadsheetAction(step: 'inspect' | 'preview' | 'confirm', form: FormData) {
  const ctx = await requireSession();
  try {
    const file = await read(form);
    const headerRow = Number(form.get('headerRow'));
    if (step === 'inspect') return { ok: true as const, step, ...inspectRgaSpreadsheet(ctx, file, headerRow) };
    const kind = String(form.get('kind')) as RgaImportKind;
    const mapping = Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith('map:')).map(([key, value]) => [key.slice(4), value]));
    const input = { ...file, kind, headerRow, mapping };
    if (step === 'preview') return { ok: true as const, step, ...await previewRgaImport(ctx, input) };
    if (step !== 'confirm' || form.get('confirmed') !== 'yes') throw new RgaImportError('Confirme explicitamente a importação.');
    const result = await confirmRgaImport(ctx, input, String(form.get('ticket') ?? ''));
    revalidatePath('/settings/import');
    revalidatePath('/clients');
    revalidatePath('/postings');
    return { ok: true as const, step, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof RgaImportError
      ? error.message : 'Não foi possível concluir a operação. Gere uma nova prévia e tente novamente.' };
  }
}
