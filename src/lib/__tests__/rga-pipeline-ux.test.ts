import { describe, expect, it } from 'vitest';
import { pipelineBoardQuery, pipelineTalentHref, pipelineViewHref } from '@/lib/rga-pipeline-ux';
describe('RGA pipeline navigation', () => {
  it('keeps scope and sort, removes single-stage filter in Kanban', () => {
    const input = { client: 'c1', posting: 'p1', stage: 's1', q: '  auxiliar & fiscal  ', sort: 'name' };
    expect(Object.fromEntries(new URL(pipelineViewHref(input, true), 'https://example.invalid').searchParams)).toEqual({ posting: 'p1', client: 'c1', q: 'auxiliar & fiscal', sort: 'name', view: 'kanban' });
    expect(new URLSearchParams(pipelineBoardQuery(input)).has('stage')).toBe(false);
  });
  it('keeps archived scope in list', () => {
    expect(Object.fromEntries(new URL(pipelineViewHref({ status: 'archived', stage: 's1', reason: 'r1' }, true), 'https://example.invalid').searchParams)).toEqual({ status: 'archived', stage: 's1', reason: 'r1' });
  });
  it('opens full talent search for selected posting and stage', () => {
    expect(Object.fromEntries(new URL(pipelineTalentHref('p+1', 's/1'), 'https://example.invalid').searchParams)).toEqual({ posting: 'p+1', q: '', from: 'pipeline', stage: 's/1' });
  });
  it('returns the canonical empty list URL', () => { expect(pipelineViewHref({}, false)).toBe('/pipeline'); });
});
