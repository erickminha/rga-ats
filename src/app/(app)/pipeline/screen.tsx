import { RecruitingBoard } from '@/components/recruiting-board';
import Link from 'next/link';
import { Kanban, Plus } from 'lucide-react';
import type { loadPipelinePage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { PipelineFilters } from '@/components/pipeline-filters';
import { PipelineList } from '@/components/pipeline-list';
import { PipelineNavProvider } from '@/components/pipeline-nav';
import { btnPrimary } from '@/components/form-controls';

export function PipelineScreen({ data }: { data: Awaited<ReturnType<typeof loadPipelinePage>> }) {
  const listInput = {
    posting: data.postingFilter,
    client: data.clientFilter,
    stage: data.stageFilter,
    q: data.q,
    status: data.archived ? "encerrados" : '',
    sort: data.sort,
    reason: data.reason,
  };

  const query = new URLSearchParams(Object.entries({ posting: data.postingFilter, client: data.clientFilter, q: data.q }).filter(([, val]) => val)).toString();

  // No key on the list: a filter change updates it in place (focus stays on
  // the tile that was clicked); it resets its own selection and loaded pages.
  return (
    <PipelineNavProvider listInput={listInput}>
      <div className="t-reveal flex h-screen flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2 px-3 sm:px-0 sm:pr-6">
          <PageHeader title="Funil de recrutamento" />
          <div className="mt-6 flex items-center gap-2">
            {!data.board && <PipelineFilters postingGroups={data.postingGroups} clients={data.clients} />}
            <Link href={`/pipeline?${query}${data.board ? '' : '&view=kanban'}`} className="text-sm underline">
              {data.board ? 'Lista' : 'Kanban'}
            </Link>
            <Link href="/contacts/new?mode=application" className={btnPrimary}>
              <Plus /> Adicionar candidato
            </Link>
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
