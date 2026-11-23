import { describe, expect, it } from 'vitest';
import { boardSearch, EMPTY_FILTERS, facetOptions, filterPostings, knownFilters, readBoardFilters, type BoardPosting } from '@/lib/job-board';

const P = (id: string, title: string, group: string, location: string | null, workplaceType: string, commitment: string): BoardPosting => ({
  id,
  slug: id,
  title,
  group,
  location,
  workplaceType,
  commitment,
});
const BOARD = [
  P('a', 'Senior Product Designer', 'Design', 'New York, NY', 'HYBRID', 'FULL_TIME'),
  P('b', 'Brand Designer', 'Design', 'Remote — US', 'REMOTE', 'CONTRACT'),
  P('c', 'Founding Engineer', 'Engineering', 'San Francisco, CA', 'ONSITE', 'FULL_TIME'),
  P('d', 'Staff Engineer, Platform', 'Engineering', 'Remote — US', 'REMOTE', 'FULL_TIME'),
  P('e', 'Data Engineer', 'Data', 'Zürich', 'HYBRID', 'FULL_TIME'),
];
const ids = (ps: BoardPosting[]) => ps.map((p) => p.id).join('');

describe('job board search', () => {
  it('localizes the fallback group while preserving existing filter links', () => {
    const other = { ...BOARD[0], group: 'Other clients', groupLabel: 'Outros clientes' };
    const board = [other, ...BOARD.slice(1)];
    const filters = readBoardFilters({ client: 'Other clients' }, 'client');
    expect(knownFilters(board, filters).group).toBe('Other clients');
    expect(filterPostings(board, { ...EMPTY_FILTERS, q: 'outros clientes' })).toEqual([other]);
    expect(facetOptions(board, EMPTY_FILTERS, 'group')).toContainEqual({
      value: 'Other clients', label: 'Outros clientes', count: 1,
    });
    expect(facetOptions(board, EMPTY_FILTERS, 'location')).toContainEqual(
      expect.objectContaining({ value: other.location, label: other.location }),
    );
  });

  it('matches every word, across title, team, location and kind of work, ignoring case and accents', () => {
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: 'designer' }))).toBe('ab');
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: 'engineer remote' }))).toBe('d');
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: 'contract' }))).toBe('b');
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: 'ZURICH' }))).toBe('e');
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: '   ' }))).toBe('abcde');
  });

  it('combines filters with the search', () => {
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, workplace: 'remote', type: 'full-time' }))).toBe('d');
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, group: 'Design', q: 'senior' }))).toBe('a');
  });

  it('counts each facet against the other filters, and skips a facet with one value', () => {
    const f = { ...EMPTY_FILTERS, workplace: 'remote' };
    expect(facetOptions(BOARD, f, 'group')).toEqual([
      { value: 'Data', label: 'Data', count: 0 },
      { value: 'Design', label: 'Design', count: 1 },
      { value: 'Engineering', label: 'Engineering', count: 1 },
    ]);
    // the facet's own filter doesn't narrow its own counts
    expect(facetOptions(BOARD, f, 'workplace').map((o) => `${o.label}:${o.count}`)).toEqual(['Híbrido:2', 'Presencial:1', 'Remoto:2']);
    expect(facetOptions(BOARD.slice(0, 1), EMPTY_FILTERS, 'group')).toEqual([]);
  });

  it('round-trips through the URL, leaving empty filters out', () => {
    const f = { ...EMPTY_FILTERS, q: ' staff ', group: 'Engineering', workplace: 'remote' };
    const search = boardSearch(f, 'team');
    expect(search).toBe('?q=staff&team=Engineering&workplace=remote');
    expect(readBoardFilters(Object.fromEntries(new URLSearchParams(search)), 'team')).toEqual({ ...f, q: 'staff' });
    expect(boardSearch(EMPTY_FILTERS, 'client')).toBe('');
    expect(readBoardFilters({ client: ['Harbor', 'x'] }, 'client').group).toBe('Harbor');
  });

  it.each(['client', 'team'])('keeps previously shared %s URLs working with localized facets', (groupKey) => {
    const query = `?${groupKey}=Engineering&location=Remote+%E2%80%94+US&workplace=remote&type=full-time`;
    const filters = knownFilters(BOARD, readBoardFilters(Object.fromEntries(new URLSearchParams(query)), groupKey));

    expect(ids(filterPostings(BOARD, filters))).toBe('d');
    expect(boardSearch(filters, groupKey)).toBe(query);
    expect(facetOptions(BOARD, filters, 'workplace')).toContainEqual({ value: 'remote', label: 'Remoto', count: 1 });
    expect(facetOptions(BOARD, filters, 'type')).toContainEqual({ value: 'full-time', label: 'Tempo integral', count: 1 });
  });

  it('accepts localized search terms and English terms from existing links', () => {
    for (const q of ['hibrido tempo integral', 'hybrid full-time']) {
      expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q }))).toBe('ae');
    }
    expect(ids(filterPostings(BOARD, { ...EMPTY_FILTERS, q: 'presencial' }))).toBe('c');
  });

  it("drops a link's filter values the board doesn't have", () => {
    expect(knownFilters(BOARD, { ...EMPTY_FILTERS, q: 'x', group: 'Sales', workplace: 'remote', type: 'seasonal' })).toEqual({
      ...EMPTY_FILTERS,
      q: 'x',
      workplace: 'remote',
    });
  });
});
