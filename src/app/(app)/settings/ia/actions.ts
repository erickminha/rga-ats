'use server';

import { revalidatePath } from 'next/cache';
import { assistantFailureMessage } from '@/server/assistant-provider';
import { testAssistant } from '@/server/rga-assistant';
import { requireSession } from '@/lib/session';
import { saveDiscAiConfiguration, testDiscAi } from '@/server/disc-ai-settings';

export async function saveDiscAiAction(form: FormData) {
  try { await saveDiscAiConfiguration(await requireSession(), form); revalidatePath('/settings/ia'); return { message: 'Configurações salvas.' }; }
  catch { return { message: 'Não foi possível salvar. Confira os limites e os provedores autorizados.' }; }
}

export async function testDiscAiAction(provider: string, model: string) {
  try { const success = await testDiscAi(await requireSession(), provider, model); revalidatePath('/settings/ia'); return { message: success ? 'Teste sintético concluído.' : 'O provedor não retornou uma interpretação válida.' }; }
  catch { return { message: 'Teste indisponível. Confira configuração e limites.' }; }
}

export async function testAssistantAction() {
  try { const result = await testAssistant(await requireSession()); revalidatePath('/settings/ia'); return { message: result.ok ? 'Conexão confirmada com dados fictícios.' : assistantFailureMessage(result.code ?? 'internal') }; }
  catch { return { message: 'Não foi possível testar a conexão.' }; }
}
