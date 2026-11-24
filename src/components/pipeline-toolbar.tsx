'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Kanban, List, Plus } from 'lucide-react';
import { PipelineFilters } from '@/components/pipeline-filters';
import { usePipelineNav } from '@/components/pipeline-nav';
import { btnPrimary, inputClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { pipelineTalentHref, pipelineViewHref } from '@/lib/rga-pipeline-ux';
type Posting = { id: string; title: string; client: string | null };
type BoardPosting = Posting & { clientId: string | null };
type Props = { board: boolean; archived: boolean; canAdd: boolean; clients: { id: string; name: string }[]; postingGroups: { label: string | null; postings: { id: string; title: string }[] }[]; boardPostings: BoardPosting[]; recruitingPostings: Posting[] };
function BoardFilters({ clients, postings, client, posting, q, sort }: { clients: Props['clients']; postings: BoardPosting[]; client: string; posting: string; q: string; sort: string }) {
  const [selectedClient, setClient] = useState(client);
  const [selectedPosting, setPosting] = useState(posting);
  return <form action="/pipeline" className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="view" value="kanban" />{sort && <input type="hidden" name="sort" value={sort} />}
    {clients.length > 0 && <label className="grid gap-1 text-xs">Empresa <select name="client" className={inputClass} value={selectedClient} onChange={(e) => { setClient(e.target.value); setPosting(''); }}><option value="">Todas</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <label className="grid max-w-56 gap-1 text-xs">Vaga <select name="posting" className={inputClass} value={selectedPosting} onChange={(e) => setPosting(e.target.value)}><option value="">Todas</option>{postings.filter((item) => !selectedClient || item.clientId === selectedClient).map((item) => <option key={item.id} value={item.id}>{item.title}{item.client ? ' — ' + item.client : ''}</option>)}</select></label>
    <label className="grid gap-1 text-xs">Candidato <input name="q" className={inputClass} defaultValue={q} placeholder="Nome ou cargo" /></label>
    <button className={buttonClass({ variant: 'secondary' })}>Filtrar</button>
  </form>;
}
export function PipelineToolbar({ board, archived, clients, postingGroups, boardPostings, recruitingPostings, canAdd }: Props) {
  const nav = usePipelineNav();
  const pending = nav.pending || nav.key !== nav.committedKey;
  const input = nav.committed;
  const selected = recruitingPostings.find((item) => item.id === input.posting);
  const newCandidateHref = '/contacts/new?' + new URLSearchParams({ mode: 'application', ...(selected ? { posting: selected.id } : {}), ...(input.stage ? { stage: input.stage } : {}) }).toString();
  return <div className="mt-3 flex flex-wrap items-end gap-2 sm:mt-6">
    {board ? <BoardFilters key={nav.committedKey} clients={clients} postings={boardPostings} client={input.client ?? ''} posting={input.posting ?? ''} q={input.q ?? ''} sort={input.sort ?? ''} /> : <PipelineFilters postingGroups={postingGroups} clients={clients} />}
    <Link href={nav.hrefFor({ status: archived ? '' : 'archived', stage: '', reason: '' })} onClick={(e) => nav.go({ status: archived ? '' : 'archived', stage: '', reason: '' }, e)} className={buttonClass({ variant: 'secondary', className: 'md:hidden' })}>{archived ? 'Ativos' : 'Encerrados'}</Link>
    {!archived && (pending ? <button disabled className={buttonClass({ variant: 'secondary' })}>{board ? 'Lista' : 'Kanban'}</button> : <Link href={pipelineViewHref(input, !board)} className={buttonClass({ variant: 'secondary' })}>{board ? <><List /> Lista</> : <><Kanban /> Kanban</>}</Link>)}
    {canAdd && !archived && (pending ? <button disabled className={btnPrimary}><Plus /> Incluir candidato</button> :
      selected ? <Link href={pipelineTalentHref(selected.id, input.stage)} className={btnPrimary}><Plus /> Incluir candidato na vaga</Link> :
      <details key={nav.committedKey} className="relative"><summary className={btnPrimary + ' cursor-pointer list-none'}><Plus /> Incluir candidato</summary>
      <div className="absolute right-0 z-30 mt-2 grid w-72 max-w-[85vw] gap-3 rounded-card border border-line bg-surface p-4 shadow-lg">
        {recruitingPostings.length ? <form action="/contacts/busca" className="grid gap-2"><input type="hidden" name="q" value="" /><input type="hidden" name="from" value="pipeline" /><input type="hidden" name="stage" value={input.stage ?? ''} /><label className="grid gap-1 text-sm">Vaga <select name="posting" required defaultValue="" className={inputClass}><option value="" disabled>Selecione a vaga</option>{recruitingPostings.map((item) => <option key={item.id} value={item.id}>{item.title}{item.client ? ' — ' + item.client : ''}</option>)}</select></label><button className={btnPrimary}>Buscar no banco de talentos</button></form> : <p className="text-sm">Nenhuma vaga disponível neste filtro.</p>}
        <Link href={newCandidateHref} className="text-sm underline">Cadastrar novo candidato</Link>
      </div></details>)}
  </div>;
}
