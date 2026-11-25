'use client';
import { useState,useTransition } from 'react';
import { buttonClass } from '@/components/ui/button';
import { testAssistantAction } from '@/app/(app)/settings/ia/actions';
import type { assistantStatus } from '@/server/assistant-provider';
export function AssistantStatusCard({ config }: { config: ReturnType<typeof assistantStatus> }) {
  const [busy,start] = useTransition();
  const [message,setMessage] = useState('');
  return <section className="rga-card grid gap-3 p-4">
    <h2 className="font-semibold">Assistente IA — busca de profissionais</h2>
    <p>{config.mode === 'direct' ? 'Provedor configurado: ' + config.provider + ' · ' + config.model : config.mode === 'legacy' ? 'Serviço intermediário configurado.' : 'Não configurado. Ative o provedor e a credencial no Cloud Run.'}</p>
    <p className="text-sm">A conexão direta consulta até 12 perfis autorizados por cargo e UF; não envia nomes, currículos ou anotações intencionalmente. Limites globais: {config.daily} chamadas/dia e {config.monthly}/mês. Nenhum fallback pago automático.</p>
    {config.mode === 'direct' && <button className={buttonClass({variant:'secondary'})} disabled={busy} onClick={() => start(async () => setMessage((await testAssistantAction()).message))}>Testar conexão com dados fictícios</button>}
    <p role="status">{message}</p>
  </section>;
}
