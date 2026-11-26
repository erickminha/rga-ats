'use client';

import { organization } from '@/lib/i18n/pt-BR/organization';
import { useMemo } from 'react';
import { Dropdown } from '@/components/dropdown';
import { usePipelineNav } from '@/components/pipeline-nav';

export function PipelineFilters({
  postingGroups,
  clients,
  owners,
}: {
  /** The rail's groups: the Posting dropdown lists the same postings, by title. */
  postingGroups: { label: string | null; postings: { id: string; title: string }[] }[];
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
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
        label="Vaga"
        value={nav.input.posting ?? ''}
        allLabel="Todas as vagas"
        options={postings.map((p) => ({ value: p.id, label: p.title }))}
        onSelect={(value) => nav.go({ posting: value })}
      />
      {!!owners.length && <Dropdown label="Responsável" value={nav.input.owner ?? ''} allLabel="Todos os responsáveis"
        options={owners.map(owner => ({ value: owner.id, label: owner.name }))}
        onSelect={(value) => nav.go({ owner: value })} />}
    </>
  );
}
