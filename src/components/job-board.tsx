'use client';

import { jobBoard } from '@/lib/i18n/pt-BR/job-board';
import { organization } from '@/lib/i18n/pt-BR/organization';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';
import { Dropdown } from '@/components/dropdown';
import { inputLgClass, noAutofill, sectionLabel, surfaceHover } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Orb } from '@/components/ui/orb';
import {
  boardSearch,
  EMPTY_FILTERS,
  facetOptions,
  filterPostings,
  type BoardFacet,
  type BoardFilters,
  type BoardPosting,
} from '@/lib/job-board';

/** Fewer roles than this and the board is short enough to read whole: no search bar. */
const SEARCH_FROM = 4;

/**
 * The public job board's roles, with search and filters. Filtering happens
 * here as people type; the URL follows along (replaceState, so Back leaves
 * the board rather than stepping through keystrokes), so a filtered board
 * can be shared, and the server renders a shared link already filtered.
 */
export function JobBoard({
  orgSlug,
  postings,
  groupKey,
  groupLabel,
  initial,
}: {
  orgSlug: string;
  postings: BoardPosting[];
  /** `team`, or `client` on an agency's board: the group's URL key. */
  groupKey: string;
  /** Display label for customers or teams. */
  groupLabel: string;
  initial: BoardFilters;
}) {
  const [filters, setFilters] = useState(initial);
  const update = (patch: Partial<BoardFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    window.history.replaceState(null, '', `${window.location.pathname}${boardSearch(next, groupKey)}`);
  };

  const shown = useMemo(() => filterPostings(postings, filters), [postings, filters]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, BoardPosting[]>();
    for (const p of shown) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
    return [...byGroup.entries()];
  }, [shown]);

  const active = Object.values(filters).some((v) => v.trim());
  const facets: [BoardFacet, string, string][] = [
    ['group', groupLabel, groupKey === 'client' ? organization.client.all : jobBoard.allTeams],
    ['location', jobBoard.filters.location, jobBoard.filters.allLocations],
    ['workplace', jobBoard.filters.workplace, jobBoard.filters.allWorkplaces],
    ['type', jobBoard.filters.type, jobBoard.filters.allTypes],
  ];

  return (
    <>
      {postings.length >= SEARCH_FROM ? (
        <div className="mt-8 flex flex-col gap-3">
          {/* a GET form, so Enter still searches before the page's script has loaded */}
          <form role="search" method="get" onSubmit={(e) => e.preventDefault()} className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              {...noAutofill}
              type="search"
              name="q"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder={groupKey === 'client' ? jobBoard.agencySearchPlaceholder : jobBoard.searchPlaceholder}
              aria-label={jobBoard.search}
              className={`${inputLgClass} pl-11`}
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {facets.map(([facet, label, allLabel]) => {
              const options = facetOptions(postings, filters, facet)
                // no dead ends: a choice that would show nothing is left out, unless it's the one picked
                .filter((o) => o.count > 0 || o.value === filters[facet]);
              if (!options.length) return null;
              return (
                <Dropdown
                  key={facet}
                  size="sm"
                  label={label}
                  allLabel={allLabel}
                  value={filters[facet]}
                  options={options}
                  onSelect={(value) => update({ [facet]: value })}
                />
              );
            })}
            {active ? (
              <button type="button" onClick={() => update(EMPTY_FILTERS)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                {jobBoard.clear}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <p aria-live="polite" className="mt-6 text-sm text-ink-2">
        {jobBoard.count(postings.length, active ? shown.length : undefined)}
      </p>

      {shown.length === 0 ? (
        <div className="mt-4 rounded-card bg-surface px-5 py-10 text-center">
          <p className="text-md text-ink">{jobBoard.noMatches}</p>
          <p className="mt-1 text-sm text-ink-2">{jobBoard.searchHint}</p>
          <button type="button" onClick={() => update(EMPTY_FILTERS)} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-5' })}>
            {jobBoard.clearFilters}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-8">
          {groups.map(([group, roles]) => (
            <section key={group}>
              <h2 className={`mb-3 ${sectionLabel}`}>{roles[0].groupLabel ?? group}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {roles.map((p) => (
                  <Link key={p.id} href={`/careers/${orgSlug}/${p.slug}`} className={`flex flex-col p-4 ${surfaceHover}`}>
                    <Orb seed={p.id} size={40} />
                    <div className="mt-6">
                      <p className="text-md font-medium text-ink">{p.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                        {p.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin size={13} /> {p.location}
                          </span>
                        ) : null}
                        <span>{jobBoard.workplace[p.workplaceType]}</span>
                        <span>{jobBoard.commitment[p.commitment]}</span>
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
