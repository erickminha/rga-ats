'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addExistingCandidateAction, searchPipelineContactsAction } from '@/app/(app)/actions';
import { btnPrimary, inputClass } from '@/components/form-controls';
import { pipelineRowCache, contactRowCache } from '@/lib/list-client/caches';

type Contact = Awaited<ReturnType<typeof searchPipelineContactsAction>>[number];
type Posting = { id: string; title: string; clientCompany: { name: string } | null };
type Stage = { id: string; name: string };

export function AddExistingCandidate({ postings, stages, postingId, stageId }: { postings: Posting[]; stages: Stage[]; postingId: string; stageId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [posting, setPosting] = useState('');
  const [stage, setStage] = useState('');
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    const node = dialog.current;
    if (open && node && !node.open) node.showModal();
    if (!open && node?.open) node.close();
  }, [open]);

  function show() {
    setPosting(postings.some((p) => p.id === postingId) ? postingId : '');
    setStage(stages.some((s) => s.id === stageId) ? stageId : stages[0]?.id ?? '');
    setQuery(''); setResults([]); setSelected(null); setSearched(false); setError(''); setMessage('');
    setOpen(true);
  }

  function search() {
    setError(''); setSelected(null); setResults([]); setSearched(false);
    start(async () => {
      try { setResults(await searchPipelineContactsAction(query)); setSearched(true); }
      catch { setError('Não foi possível buscar candidatos. Tente novamente.'); }
    });
  }

  function add() {
    if (!selected || !posting || !stage) return;
    setError('');
    start(async () => {
      try {
        const result = await addExistingCandidateAction({ contactId: selected.id, postingId: posting, stageId: stage });
        if (result.error) { setError(result.error); return; }
        setMessage(`${selected.name} incluído na vaga.`);
        setOpen(false);
        pipelineRowCache.clear(); contactRowCache.clear(); router.refresh();
      } catch { setError('Não foi possível incluir o candidato. Tente novamente.'); }
    });
  }

  return <div className="relative">
    <button ref={trigger} type="button" className={btnPrimary} onClick={show}><Plus size={18} /> Adicionar candidato</button>
    {message && <p role="status" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-field border border-line bg-surface p-2 text-sm">{message}</p>}
    <dialog ref={dialog} aria-labelledby="add-candidate-heading" className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-card border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/40"
      onCancel={(e) => { e.preventDefault(); if (!pending) setOpen(false); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="add-candidate-heading" className="font-semibold">Incluir candidato do banco de talentos</h2>
          <button type="button" disabled={pending} className="underline text-sm" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
          <input aria-label="Buscar candidato" className={`${inputClass} min-w-0 flex-1`} placeholder="Nome, cargo ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} disabled={pending} />
          <button type="submit" className={btnPrimary} disabled={pending || query.trim().length < 2}>Buscar</button>
        </form>
        <div className="my-3 max-h-52 overflow-y-auto" aria-live="polite">
          {searched && !results.length && <p className="text-sm text-ink-2">Nenhum candidato encontrado.</p>}
          {results.map((contact) => <button type="button" key={contact.id} aria-pressed={selected?.id === contact.id} disabled={pending} onClick={() => setSelected(contact)} className={`block w-full rounded-field border p-2 text-left text-sm ${selected?.id === contact.id ? 'border-blue-500' : 'border-transparent hover:bg-muted'}`}>
            <span className="block font-medium">{contact.name}</span>
            <span className="block text-ink-2">{[contact.headline, contact.location, contact.emails[0]].filter(Boolean).join(' · ') || 'Sem dados complementares'}</span>
          </button>)}
          {results.length === 30 && <p className="text-xs text-ink-2">Refine a busca para ver outros candidatos.</p>}
        </div>
        <label className="block text-sm mb-3">Vaga
          <select className={`${inputClass} mt-1 w-full`} value={posting} disabled={pending} onChange={(e) => setPosting(e.target.value)}>
            <option value="">Selecione a vaga</option>
            {postings.map((p) => <option key={p.id} value={p.id}>{p.title}{p.clientCompany ? ` — ${p.clientCompany.name}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-sm mb-3">Etapa
          <select className={`${inputClass} mt-1 w-full`} value={stage} disabled={pending} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="mb-3 text-sm text-critical">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/contacts/new?mode=application" className="text-sm underline">Cadastrar novo candidato</Link>
          <button type="button" className={btnPrimary} disabled={pending || !selected || !posting || !stage} onClick={add}>{pending ? 'Processando…' : 'Incluir na vaga'}</button>
        </div>
    </dialog>
  </div>;
}
