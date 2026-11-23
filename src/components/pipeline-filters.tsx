'use client';

import { organization } from '@/lib/i18n/pt-BR/organization';
import { useMemo } from 'react';
import { Dropdown } from '@/components/dropdown';
import { usePipelineNav } from '@/components/pipeline-nav';

export function PipelineFilters({
  postingGroups,
  clients,
}: {
  /** The rail's groups: the Posting dropdown lists the same postings, by title. */
  postingGroups: { label: string | null; postings: { id: string; title: string }[] }[];
  clients: { id: string; name: string }[];
}) {
  const nav = usePipelineNav();
  const postings = useMemo(
    () => postingGroups.flatMap((g) => g.postings).sort((a, b) => a.title.localeCompare(b.title)),
    [postingGroups],
  );

  return (
    <>
      {clients.length > 0 ? (
        <Dropdown
          label={organization.client.singular}
          value={nav.input.client ?? ''}
          allLabel={organization.client.all}
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          // A client change resets the posting.
          onSelect={(value) => nav.go({ client: value, posting: '' })}
        />
      ) : null}
      <Dropdown
        label="Posting"
        value={nav.input.posting ?? ''}
        allLabel="All postings"
        options={postings.map((p) => ({ value: p.id, label: p.title }))}
        onSelect={(value) => nav.go({ posting: value })}
      />
    </>
  );
}
