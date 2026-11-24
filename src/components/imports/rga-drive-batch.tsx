'use client';

import { useState, useTransition } from 'react';
import { driveResumeBatchAction } from '@/app/(app)/contacts/[id]/curriculo-drive/actions';
import { buttonClass } from '@/components/ui/button';

export function RgaDriveBatch() {
  const [state, setState] = useState<Awaited<ReturnType<typeof driveResumeBatchAction>>>();
  const [offset, setOffset] = useState(0);
  const [busy, start] = useTransition();
  function run(position: number, confirm = false) {
    start(async () => {
      try {
        const next = await driveResumeBatchAction(confirm ? state?.result?.tickets : undefined, position);
        setState(next); setOffset(confirm ? 0 : position);
      } catch { setState({ error: 'Falha de comunicação. Consulte uma nova prévia para retomar.' }); }
    });
  }
  const r = state?.result;
  return <section className="rga-card grid gap-3 p-5">
    <h2 className="text-lg font-semibold">Conciliação de currículos do Drive</h2>
    <p>Confira até cinco documentos por lote. Originais, currículos principais e participações anteriores são preservados.</p>
    <button className={buttonClass({ variant: 'secondary' })} type="button" disabled={busy} onClick={() => run(0)}>Conferir primeiro lote pendente</button>
    {busy && <p role="status">Consultando o lote…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {r && <div className="grid gap-2" aria-live="polite">
      <p>Pendentes na leitura: {r.pending}. Sem vínculo seguro ou autorização: {r.blocked}. Erros: {r.errors}.</p>
      {r.tickets.length > 0 && <button className={buttonClass({ variant: 'primary' })} disabled={busy} onClick={() => run(offset, true)}>Confirmar cópia de {r.tickets.length} documento(s)</button>}
      {(r.copied > 0 || r.unchanged > 0) && <p>Novas versões vinculadas: {r.copied}. Versões já existentes: {r.unchanged}.</p>}
      {r.pending > offset + 5 && <button type="button" disabled={busy} className="underline" onClick={() => run(offset + 5)}>Conferir os próximos cinco</button>}
    </div>}
  </section>;
}
