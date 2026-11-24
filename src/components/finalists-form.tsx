'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { presentFinalistsAction, revokeFinalistsAction } from '@/app/(app)/recruiting-actions';
import { opinionFields } from '@/lib/i18n/pt-BR/assessment';
import { btnTonal } from '@/components/form-controls';

type Finalist = {
  id: string; name: string; headline: string | null; stage: string; interviewed: boolean;
  discComplete: boolean; opinionFinal: boolean; canShare: boolean;
  opinionSummary: Record<string, string>; resumeId?: string; discId?: string; version?: number; reviewFingerprint: string;
};

export function FinalistsForm({ id, finalists, enabled }: { id: string; finalists: Finalist[]; enabled: boolean }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState(false);
  const selectDoc = (name: string, id: string, checked: boolean) => {
    setDocuments((current) => ({ ...current, [name]: checked ? [...(current[name] ?? []), id] : (current[name] ?? []).filter((item) => item !== id) }));
    setPreview(false);
  };
  const selectedDocument = (name: string, id: string) => documents[name]?.includes(id) ?? false;
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
            onChange={(event) => {
              setSelected((current) => event.target.checked ? [...current, person.id] : current.filter((item) => item !== person.id));
              setPreview(false);
            }} /> Apresentar ao cliente</label>
          {([
            ['opinions', person.opinionFinal, 'Resumo profissional do parecer finalizado', null],
            ['pdf', person.opinionFinal && !!person.version, 'PDF do parecer para o cliente', null],
            ['resumes', !!person.resumeId, 'Currículo desta candidatura', person.resumeId],
            ['discs', !!person.discId, 'Relatório original DISC', person.discId],
          ] as const).filter(([, available]) => available).map(([field, , label, fileId]) => <div key={field}>
            <label><input name={field} value={person.id} checked={selectedDocument(field, person.id)} disabled={!selected.includes(person.id)}
              type="checkbox" onChange={(event) => selectDoc(field, person.id, event.target.checked)} /> {label}</label>
            {fileId && <a className="ml-2 text-sm underline" href={`/api/files/${fileId}`} target="_blank" rel="noreferrer">Conferir arquivo</a>}
          </div>)}
        </>}
        {!person.canShare && <p className="text-xs">Participação confidencial</p>}
      </article>)}
      {enabled && selected.length > 0 && <>
        <button type="button" className={btnTonal} onClick={() => setPreview(true)}>Revisar apresentação</button>
        {preview && <section className="grid gap-3 rounded-xl border border-line p-4" aria-label="Prévia para o cliente">
          <h3 className="font-medium">Prévia para o cliente</h3>
          {finalists.filter((person) => selected.includes(person.id)).map((person) => <article key={person.id}>
            <input type="hidden" name={'review-' + person.id} value={person.reviewFingerprint} />
            <h4 className="font-medium">{person.name}</h4>
            {person.headline && <p>{person.headline}</p>}
            {(selectedDocument('opinions', person.id) || selectedDocument('pdf', person.id)) &&
              Object.entries(person.opinionSummary).map(([field, value]) => value && <div key={field}>
                <p className="font-medium">{opinionFields[field as keyof typeof opinionFields]}</p><p className="whitespace-pre-wrap">{value}</p>
              </div>)}
            {selectedDocument('pdf', person.id) && <p>Parecer para o cliente em PDF, versão {person.version}</p>}
            {selectedDocument('resumes', person.id) && <p>Currículo selecionado</p>}
            {selectedDocument('discs', person.id) && <p>Relatório original DISC selecionado</p>}
          </article>)}
          <label><input type="checkbox" name="confirmed" required /> Revisei o conteúdo e confirmo que o cliente pode receber os dados e arquivos selecionados.</label>
          <button className={btnTonal} disabled={pending}>Gerar link de apresentação</button>
        </section>}
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
