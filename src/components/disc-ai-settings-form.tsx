'use client';

import { useState, useTransition } from 'react';
import type { discAiConfiguration } from '@/server/disc-ai-settings';
import { saveDiscAiAction, testDiscAiAction } from '@/app/(app)/settings/ia/actions';
import { buttonClass } from '@/components/ui/button';

export function DiscAiSettingsForm({ config }: { config: Awaited<ReturnType<typeof discAiConfiguration>> }) {
  const [message, setMessage] = useState('');
  const [busy, start] = useTransition();
  return <section className="rga-card grid gap-3 p-4">
    <p>Somente provedores e modelos previamente habilitados na infraestrutura aparecem aqui. As credenciais permanecem no Secret Manager.</p>
    {!config.approved.length && <p>Nenhum provedor externo habilitado. O DISC continuará usando a interpretação local.</p>}
    <form className="grid gap-3" action={form => start(async () => setMessage((await saveDiscAiAction(form)).message))}>
      {[0,1,2].map(i => <label key={i} className="grid gap-1">{i === 0 ? 'Provedor principal' : 'Alternativa ' + i}
        <select name={'slot' + i} className="rounded-field border border-line p-2" defaultValue={config.providers[i] ? config.providers[i].provider + '|' + config.providers[i].model : ''}>
          <option value="">Desativado</option>
          {config.approved.flatMap(x => x.models.map(model => <option key={x.provider + '|' + model} value={x.provider + '|' + model}>{x.provider} · {model}</option>))}
        </select>
      </label>)}
      <label>Limite diário de requisições <input type="number" name="daily" min={0} max={config.caps.daily} defaultValue={config.daily} className="w-24 rounded-field border border-line p-2" /></label>
      <label>Limite mensal de requisições <input type="number" name="monthly" min={0} max={config.caps.monthly} defaultValue={config.monthly} className="w-24 rounded-field border border-line p-2" /></label>
      <p className="text-sm">Zero desativa chamadas. Os tetos globais e a cobrança do fornecedor são controlados na infraestrutura; não há garantia de gratuidade.</p>
      <button className={buttonClass({ variant: 'primary' })} disabled={busy}>Salvar configuração</button>
    </form>
    {config.providers.map(x => <button key={x.provider} disabled={busy} className={buttonClass({ variant: 'secondary' })} onClick={() => start(async () => setMessage((await testDiscAiAction(x.provider, x.model)).message))}>Testar {x.provider} com dados fictícios</button>)}
    <p role="status">{message}</p>
  </section>;
}
