'use client';

import { useState, useTransition } from 'react';
import { editDiscAction, emailDiscAction, issueDiscAction, manageDiscAction } from '@/app/(app)/disc/actions';
import type { localDiscInterpretation } from '@/lib/native-disc';
import { buttonClass } from '@/components/ui/button';

export function DiscInvite({ opportunityId, test }: { opportunityId: string; test: boolean }) {
  const [notice, setNotice] = useState('');
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<Awaited<ReturnType<typeof issueDiscAction>>>();
  const [busy, start] = useTransition();
  return <div className="grid gap-3">
    <label className="text-sm">Prazo em dias <input className="w-20 rounded-field border border-line p-1" type="number" min={1} max={30} value={days} onChange={e => setDays(+e.target.value)} /></label>
    <button className={buttonClass({ variant: 'secondary' })} disabled={busy} onClick={() => start(async () => setResult(await issueDiscAction(opportunityId, days, test)))}>
      {test ? 'Solicitar DISC fictício' : 'Solicitar ou renovar DISC'}
    </button>
    {result?.error && <p role="alert">{result.error}</p>}
    {result?.url && <div className="grid gap-2">
      <label className="text-sm">Link individual <input readOnly value={result.url} className="block w-full rounded-field border border-line p-2" onFocus={event => event.target.select()} /></label>
      <label className="text-sm">Mensagem de convite <textarea readOnly value={result.message} className="block w-full rounded-field border border-line p-2" /></label>
      <button className="justify-self-start underline" onClick={async () => {
        try { await navigator.clipboard.writeText(result.url!); setNotice('Link copiado.'); }
        catch { setNotice('Selecione e copie o link no campo acima.'); }
      }}>Copiar link</button>
      {!test && <button className="justify-self-start underline" disabled={busy} onClick={() => start(async () => {
        const sent = await emailDiscAction(new URL(result.url!).hash.slice(1));
        setNotice(sent.message ?? sent.error ?? '');
      })}>Enviar ao e-mail cadastrado</button>}
      {notice && <p role="status">{notice}</p>}
      {!test && <a className="underline" href={'https://wa.me/?text=' + encodeURIComponent(result.message ?? '')} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
    </div>}
  </div>;
}

export function DiscManage({ id, action }: { id: string; action: 'cancel' | 'prepare' | 'review' }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState('');
  return <div>
    <button className="underline" disabled={busy} onClick={() => start(async () => {
      const result = await manageDiscAction(id, action);
      setError(result.error ?? '');
    })}>{action === 'cancel' ? 'Cancelar link' : action === 'prepare' ? 'Preparar interpretação' : 'Concluir revisão'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function DiscInterpretationEditor({ id, revision, analysis }: { id: string; revision: number; analysis: ReturnType<typeof localDiscInterpretation> }) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState('');
  const fields = [
    ['expected', 'Comportamento esperado', 400], ['detail', 'Avaliação detalhada', 2500],
    ['attention', 'Pontos de atenção', 1200], ['environment', 'Ambiente de trabalho', 1200],
    ['interview', 'Aspectos a explorar na entrevista', 1200],
  ] as const;
  return <details className="rounded-lg border border-line p-3">
    <summary className="cursor-pointer font-medium">Editar interpretação antes de concluir</summary>
    <form key={revision} className="mt-3 grid gap-3" action={form => start(async () => {
      const input = { ...Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? '')])),
        strengths: [0, 1, 2].map(i => String(form.get('strength' + i) ?? '')) };
      const result = await editDiscAction(id, revision, input);
      setMessage(result.message ?? result.error ?? '');
    })}>
      {fields.map(([key, label, max]) => <label className="grid gap-1 text-sm" key={key}>{label}
        <textarea name={key} required maxLength={max} rows={3} defaultValue={analysis[key]} className="rounded-field border border-line p-2" />
      </label>)}
      {[0, 1, 2].map(i => <label className="grid gap-1 text-sm" key={i}>Possível força {i + 1}
        <input name={'strength' + i} required maxLength={250} defaultValue={analysis.strengths[i]} className="rounded-field border border-line p-2" />
      </label>)}
      <button className={buttonClass({ variant: 'secondary' })} disabled={busy}>Salvar interpretação</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
