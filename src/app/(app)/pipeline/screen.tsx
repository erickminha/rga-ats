import { RecruitingBoard } from '@/components/recruiting-board';
import Link from 'next/link';
import { Kanban, List, Plus } from 'lucide-react';
import type { loadPipelinePage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { PipelineFilters } from '@/components/pipeline-filters';
import { PipelineList } from '@/components/pipeline-list';
import { PipelineNavProvider } from '@/components/pipeline-nav';
import { btnPrimary, inputClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';

export function PipelineScreen({ data }: { data: Awaited<ReturnType<typeof loadPipelinePage>> }) {
  const listInput = {
    posting: data.postingFilter,
    client: data.clientFilter,
    stage: data.stageFilter,
    q: data.q,
    status: data.archived ? 'archived' : '',
    sort: data.sort,
    reason: data.reason,
  };

  const query = new URLSearchParams(Object.entries({ posting: data.postingFilter, client: data.clientFilter, q: data.q }).filter(([, val]) => val)).toString();

  const selectedPosting = data.recruitingPostings.find((posting) => posting.id === data.postingFilter);
  const addParams = new URLSearchParams({ q: '', ...(selectedPosting ? { posting: selectedPosting.id } : {}), ...(data.stageFilter ? { stage: data.stageFilter } : {}), from: 'pipeline' });

  // No key on the list: a filter change updates it in place (focus stays on
  // the tile that was clicked); it resets its own selection and loaded pages.
  return (
    <PipelineNavProvider listInput={listInput}>
      <div className="t-reveal flex h-screen flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2 px-3 sm:px-0 sm:pr-6">
          <PageHeader title="Funil de recrutamento" subtitle="Acompanhe os candidatos e movimente as etapas da seleção." />
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-6">
            {!data.board && <PipelineFilters postingGroups={data.postingGroups} clients={data.clients} />}
            <Link href={`/pipeline?${query}${data.board ? '' : '&view=kanban'}`} className={buttonClass({ variant: 'secondary' })}>
              {data.board ? <><List /> Lista</> : <><Kanban /> Kanban</>}
            </Link>
            {data.canAddCandidate && (selectedPosting ? (
              <Link href={`/contacts/busca?${addParams.toString()}`} className={btnPrimary}>
                <Plus /> Incluir candidato na vaga
              </Link>
            ) : (
              <details className="relative">
                <summary className={`${btnPrimary} cursor-pointer list-none`}><Plus /> Incluir candidato</summary>
                <div className="absolute right-0 z-30 mt-2 grid w-72 max-w-[85vw] gap-3 rounded-card border border-line bg-surface p-4 shadow-lg">
                  {data.recruitingPostings.length ? <form action="/contacts/busca" className="grid gap-2">
                    <input type="hidden" name="q" value="" />
                    <input type="hidden" name="from" value="pipeline" />
                    <input type="hidden" name="stage" value={data.stageFilter} />
                    <label className="grid gap-1 text-sm">Vaga
                      <select className={inputClass} name="posting" required defaultValue="">
                        <option value="" disabled>Selecione a vaga</option>
                        {data.recruitingPostings.map((posting) => <option key={posting.id} value={posting.id}>{posting.title}{posting.client ? ` — ${posting.client}` : ''}</option>)}
                      </select>
                    </label>
                    <button className={btnPrimary}>Buscar no banco de talentos</button>
                  </form> : <p className="text-sm">Nenhuma vaga disponível neste filtro.</p>}
                  <Link href="/contacts/new?mode=application" className="text-sm underline">Cadastrar novo candidato</Link>
                </div>
              </details>
            ))}
          </div>
        </div>

        {data.archived && <form action="/pipeline" className="mx-6 mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="status" value="archived" />
          {Array.from(new URLSearchParams(query)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <label>Motivo <select name="reason" defaultValue={data.reason}>
            <option value="">Todos os motivos</option>
            {data.archiveReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
          </select></label>
          <button className="underline">Filtrar</button>
        </form>}
        {data.board ? <RecruitingBoard stages={data.board} query={query} /> : data.empty ? (
          <EmptyState
            icon={Kanban}
            title="O funil está vazio"
            description="Adicione uma candidatura para acompanhar sua evolução pelas etapas."
          />
        ) : (
          <PipelineList
            stages={data.stages}
            counts={data.counts}
            page={data.page}
            after={data.after}
            postingGroups={data.postingGroups}
            clients={data.clients}
            archiveReasons={data.archiveReasons}
            fallbackGroupLabel={data.fallbackGroupLabel}
          />
        )}
      </div>
    </PipelineNavProvider>
  );
}
