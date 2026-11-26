import { listHref, listKey, PIPELINE_KEYS, type ListInput } from '@/lib/list-client/list-key';
type Input = ListInput<(typeof PIPELINE_KEYS)[number]>;
export function pipelineBoardQuery(input: Input): string {
  return listKey({ posting: input.posting, client: input.client, owner: input.owner, q: input.q, sort: input.sort }, PIPELINE_KEYS);
}
export function pipelineViewHref(input: Input, board: boolean): string {
  const query = new URLSearchParams(pipelineBoardQuery(input));
  if (board && input.status !== 'archived') query.set('view', 'kanban');
  else if (input.status === 'archived') {
    query.set('status', 'archived');
    if (input.reason) query.set('reason', input.reason);
    if (input.stage) query.set('stage', input.stage);
  }
  return listHref('/pipeline', query.toString());
}
export function pipelineTalentHref(posting: string, stage?: string): string {
  const q = new URLSearchParams({ posting, q: '', from: 'pipeline' });
  if (stage) q.set('stage', stage);
  return '/contacts/busca?' + q.toString();
}
