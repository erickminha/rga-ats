'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { presentFinalistsAction, revokeFinalistsAction } from '@/app/(app)/recruiting-actions';
import { btnTonal } from '@/components/form-controls';

type Finalist = {
  id: string; name: string; headline: string | null; stage: string; interviewed: boolean;
  discComplete: boolean; opinionFinal: boolean; canShare: boolean;
};

export function FinalistsForm({ id, finalists, enabled }: { id: string; finalists: Finalist[]; enabled: boolean }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  return <div className="grid gap-3">
    <form className="grid gap-3" action={(form) => start(async () => {
      setMessage('');
      setUrl('');
      try { setUrl(await presentFinalistsAction(id, form)); }
      catch { setMessage('Não foi possível gerar o link. Confira a seleção, os pareceres e a situação da vaga.'); }
    })}>
      {finalists.length === 0 && <p>Nenhuma participação nas etapas de finalistas.</p>}
      {finalists.map((person) => <article key={person.id} className="grid gap-1 rounded-field border border-line p-3">
        <Link className="font-medium underline" href={`/candidates/${person.id}`}>{person.name}</Link>
        {person.headline && <p className="text-xs text-ink-2">{person.headline}</p>}
        <p className="text-xs">{person.stage} · Entrevista {person.interviewed ? 'concluída' : 'pendente'} · DISC {person.discComplete ? 'concluído' : 'pendente'} · Parecer {person.opinionFinal ? 'finalizado' : 'pendente'}</p>
        {enabled && person.canShare && <>
          <label><input type="checkbox" name="candidates" value={person.id} checked={selected.includes(person.id)}
            onChange={(event) => setSelected((current) => event.target.checked ? [...current, person.id] : current.filter((item) => item !== person.id))} /> Apresentar ao cliente</label>
          {person.opinionFinal && <label><input type="checkbox" name="opinions" value={person.id} disabled={!selected.includes(person.id)} /> Incluir resumo profissional do parecer finalizado</label>}
        </>}
        {!person.canShare && <p className="text-xs">Participação confidencial</p>}
      </article>)}
      {enabled && selected.length > 0 && <>
        <label><input type="checkbox" name="confirmed" required /> Confirmo a autorização para compartilhar os dados profissionais selecionados.</label>
        <button className={btnTonal} disabled={pending}>Gerar link de apresentação</button>
      </>}
    </form>
    {!enabled && <p className="text-sm">Para compartilhar, publique a vaga e vincule uma empresa cliente ativa.</p>}
    {url && <div className="flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" rel="noreferrer" className="underline">Abrir apresentação</a>
      <button type="button" className={btnTonal} onClick={() => {
        void navigator.clipboard.writeText(url).then(() => setMessage('Link copiado.'), () => setMessage('Não foi possível copiar.'));
      }}>Copiar link</button>
    </div>}
    <button type="button" className={btnTonal} disabled={pending} onClick={() => {
      if (!window.confirm('Revogar os links de apresentação desta vaga?')) return;
      start(async () => {
        try { await revokeFinalistsAction(id); setUrl(''); setMessage('Links revogados.'); }
        catch { setMessage('Não foi possível revogar os links.'); }
      });
    }}>Revogar links de apresentação</button>
    <p role="status" className="text-sm">{message}</p>
  </div>;
}
