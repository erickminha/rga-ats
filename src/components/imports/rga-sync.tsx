'use client';

import { useState, useTransition } from 'react';
import { syncTalentsAction } from '@/app/(app)/settings/import/sincronizar/actions';
import { buttonClass } from '@/components/ui/button';
import { RgaImportReport } from './rga-import-report';

export function RgaSync() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof syncTalentsAction>>['result']>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const [busy, start] = useTransition();
  function run(mode: 'confirm' | 'preview') {
    start(async () => {
      setError('');
      try {
        const response = await syncTalentsAction(mode, result?.ticket ?? null, retry);
        setResult(response.result);
        if (response.error) setError(response.error);
      } catch { setError('A conexão foi interrompida. Consulte o histórico e gere outra prévia.'); setResult(undefined); }
    });
  }
  return <section className="rga-card grid gap-3 p-5" aria-labelledby="titulo-sync">
    <h2 id="titulo-sync" className="text-lg font-semibold">Sincronização do Banco de Talentos</h2>
    <p className="text-sm">Confira os cadastros novos ou alterados antes de gravar cada lote de até 100 registros.</p>
    <label className="text-sm"><input type="checkbox" checked={retry} disabled={busy} onChange={e => {
      setRetry(e.target.checked); setResult(undefined);
    }} /> Reprocessar também os registros com erro</label>
    <button type="button" className={buttonClass({ variant: 'secondary' })} disabled={busy} onClick={() => run('preview')}>Consultar alterações na planilha</button>
    {busy && <p role="status">Processando…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div className="grid gap-3" aria-live="polite">
      <p>Alterações encontradas: {result.changed}. Linhas com ID ausente, duplicado ou inválido: {result.unresolved}.</p>
      {result.report && <RgaImportReport report={result.report} />}
      {result.ticket && <button type="button" disabled={busy} className={buttonClass({ variant: 'primary' })} onClick={() => run('confirm')}>Confirmar este lote</button>}
      {!result.ticket && result.count > 0 && <p>Lote registrado no histórico de importações.</p>}
    </div>}
  </section>;
}
