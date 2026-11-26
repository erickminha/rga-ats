import Link from 'next/link';
import { RecruitingBoard } from '@/components/recruiting-board';
import type { loadPipelinePage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { PipelineList } from '@/components/pipeline-list';
import { PipelineNavProvider } from '@/components/pipeline-nav';
import { PipelineToolbar } from '@/components/pipeline-toolbar';
import { pipelineBoardQuery } from '@/lib/rga-pipeline-ux';

export function PipelineScreen({ data }: { data: Awaited<ReturnType<typeof loadPipelinePage>> }) {
  const listInput = { posting: data.postingFilter, client: data.clientFilter, owner: data.ownerFilter, stage: data.stageFilter, q: data.q, status: data.archived ? 'archived' : '', sort: data.sort, reason: data.reason };
  const query = pipelineBoardQuery(listInput);
  return <PipelineNavProvider listInput={listInput}>
    <div className="t-reveal flex h-dvh flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 sm:px-0 sm:pr-6">
        <PageHeader title="Funil de recrutamento" subtitle="Acompanhe os candidatos e movimente as etapas da seleção." />
        <PipelineToolbar board={!!data.board} archived={data.archived} clients={data.clients} owners={data.owners} postingGroups={data.postingGroups} boardPostings={data.boardPostings} recruitingPostings={data.recruitingPostings} canAdd={data.canAddCandidate} />
      </div>
      <div className="px-3 pb-2 text-sm sm:px-6">
        <Link className="underline" href={{ pathname: '/pipeline/operacao', query: { posting: data.postingFilter, client: data.clientFilter, owner: data.ownerFilter, stage: data.stageFilter } }}>Acompanhamento operacional</Link>
      </div>
      {data.archived && <form action="/pipeline" className="mx-6 mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="status" value="archived" />
        {Array.from(new URLSearchParams(query)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        {data.stageFilter && <input type="hidden" name="stage" value={data.stageFilter} />}
        <label>Motivo <select name="reason" defaultValue={data.reason}><option value="">Todos os motivos</option>{data.archiveReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
        <button className="underline">Filtrar</button>
      </form>}
      {data.board ? <RecruitingBoard stages={data.board} query={query} /> : <PipelineList stages={data.stages} counts={data.counts} page={data.page} after={data.after} postingGroups={data.postingGroups} clients={data.clients} owners={data.owners} archiveReasons={data.archiveReasons} fallbackGroupLabel={data.fallbackGroupLabel} />}
    </div>
  </PipelineNavProvider>;
}
