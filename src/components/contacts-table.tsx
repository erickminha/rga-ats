'use client';

import { appLocale } from '@/lib/i18n';
import Link from 'next/link';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { Users } from 'lucide-react';
import {
  addContactsToPoolAction,
  removeContactsFromPoolAction,
  revalidateListsAction,
} from '@/app/(app)/actions';
import { POOL_BULK_LIMIT } from '@/lib/bulk';
import { runOptimisticBulk } from '@/lib/optimistic';
import type { BoundedCount, ContactRow, ListPage } from '@/lib/list-types';
import { contactRowCache } from '@/lib/list-client/caches';
import { listHref } from '@/lib/list-client/list-key';
import { useKeysetList } from '@/lib/list-client/use-keyset-list';
import { useContactsNav, useLanded } from '@/components/contacts-nav';
import { LoadMore } from '@/components/list/load-more';
import { useWindowedRows } from '@/components/list/virtual-rows';
import { EmptyState } from '@/components/empty-state';
import { FormSelect } from '@/components/form-select';
import { surface } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Avatar } from '@/components/ui/orb';
import { Badge } from '@/components/ui/primitives';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export type { ContactRow };

const ENDPOINT = '/api/lists/contacts';
const ROW_H = 52;
const HEAD_H = 44;
const EMPTY = new Set<string>();
const fmt = (n: number) => n.toLocaleString(appLocale);

/**
 * Contacts table with selection + pool bulk actions. Filtering happens
 * server-side (?q= &tag= &pool=); this component owns the loaded pages, the
 * checkboxes and the add/remove-to-pool bar. Like the pipeline, a switch to
 * another pool, tag or search shows the target's cached first page at once
 * or dims the current rows until the server's render lands.
 */
export function ContactsTable({
  page,
  after,
  total,
  staticPools,
  currentPoolId,
  currentPoolStatic,
}: {
  /** First page, rendered on the server. */
  page: ListPage<ContactRow>;
  /** The cursor the server rendered after ('' on the first page). */
  after: string;
  /** How many match, arriving after the rows. */
  total: Promise<BoundedCount | null>;
  staticPools: { id: string; name: string }[];
  currentPoolId: string | null;
  currentPoolStatic: boolean;
}) {
  const nav = useContactsNav();
  const committedKey = nav.committedKey;
  const displayKey = nav.pending ? nav.key : committedKey;
  const [, startTransition] = useTransition();
  const [targetPool, setTargetPool] = useState('');
  // The total belongs to one list: after a switch, none until the new one lands.
  const count = useLanded(total, committedKey);

  const store = useKeysetList({ listKey: committedKey, first: page, endpoint: ENDPOINT });
  useSyncExternalStore(contactRowCache.subscribe, contactRowCache.version, () => 0);
  const cached = displayKey !== committedKey ? contactRowCache.peek(displayKey) : undefined;
  const stale = displayKey !== committedKey && !cached;
  const shownFilter = cached ? nav.input : nav.committed;

  // The committed first page is itself a cache entry: back-and-forth is instant.
  useEffect(() => {
    if (!after) contactRowCache.put(committedKey, page);
  }, [after, committedKey, page]);

  // Removing people from the pool you're viewing takes them off the list now.
  const [visible, hideRows] = useOptimistic(cached ? cached.rows : store.rows, (rows, ids: string[]) =>
    rows.filter((r) => !ids.includes(r.id)),
  );

  const [selection, setSelection] = useState({ key: displayKey, ids: EMPTY });
  if (selection.key !== displayKey) setSelection({ key: displayKey, ids: EMPTY });
  const selected = selection.key === displayKey ? selection.ids : EMPTY;
  const setSelected = (ids: Set<string>) => setSelection({ key: displayKey, ids });
  // Stable, so toggling one checkbox re-renders one row.
  const toggle = useCallback(
    (id: string) =>
      setSelection((prev) => {
        const ids = new Set(prev.ids);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { key: prev.key, ids };
      }),
    [],
  );
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const ids = [...selected];

  const scroller = useRef<HTMLDivElement>(null);
  // A new list starts at the top. Only touch scrollTop when it moved: setting
  // it forces a layout of the whole table inside the click's task.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!scrolled.current || !scroller.current) return;
    scroller.current.scrollTop = 0;
    scrolled.current = false;
  }, [displayKey]);

  const people = (n: number) => `${fmt(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`;
  // On failure the unsaved people are selected again, ready to retry.
  const reselect = (unsaved: string[]) => setSelected(new Set(unsaved));
  const { applyCommitted } = store;
  const addToPool = (poolId: string) => {
    setSelected(EMPTY);
    // Adding doesn't change this list, so there's nothing to show early.
    runOptimisticBulk({
      startTransition,
      items: ids,
      size: POOL_BULK_LIMIT,
      run: (chunk, final) => addContactsToPoolAction(poolId, chunk, final),
      refresh: revalidateListsAction,
      copy: { failure: `Adicionando ${people(ids.length)} ao grupo`, done: 'Adicionados', skipped: "não puderam ser adicionados" },
      onFailure: reselect,
    });
  };
  const removeFromPool = (poolId: string) => {
    setSelected(EMPTY);
    runOptimisticBulk({
      startTransition,
      items: ids,
      size: POOL_BULK_LIMIT,
      apply: hideRows,
      run: (chunk, final) => removeContactsFromPoolAction(poolId, chunk, final),
      onChunkSaved: (chunk) => applyCommitted((rows) => rows.filter((r) => !chunk.includes(r.id))),
      refresh: revalidateListsAction,
      copy: { failure: `Removendo ${people(ids.length)} do grupo`, done: 'Removidos', skipped: "não puderam ser removidos" },
      onFailure: reselect,
    });
  };

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { slots, complete, scrollToIndex } = useWindowedRows({
    rows: visible,
    // The list these rows belong to: a new one mounts a few rows per frame.
    listKey: cached ? displayKey : committedKey,
    scrollerRef: scroller,
    rowHeight: ROW_H,
    headerHeight: HEAD_H,
    focusedId,
  });
  const [announcement, setAnnouncement] = useState('');
  // A deliberate Load more moves focus to the first new row — of the list it
  // was pressed on, never one switched to while it loaded.
  const focusAfterLoad = useRef<{ key: string; index: number } | null>(null);
  const focusRow = useRef<string | null>(null);
  const { loadMore } = store;
  const onLoad = useCallback(
    (reason: 'auto' | 'user') => {
      // An automatic load racing a deliberate one must not cancel its focus.
      if (reason === 'user') focusAfterLoad.current = { key: committedKey, index: store.rows.length };
      void loadMore();
    },
    [loadMore, store.rows.length, committedKey],
  );
  useEffect(() => {
    focusAfterLoad.current = null;
    focusRow.current = null;
  }, [committedKey]);
  const seenPages = useRef(store.pages);
  useEffect(() => {
    const added = store.pages > seenPages.current;
    seenPages.current = store.pages;
    if (!added) return;
    const of = count ? ` of ${fmt(count.count)}${count.capped ? '+' : ''}` : '';
    setAnnouncement(`Loaded more contacts. Showing ${fmt(store.rows.length)}${of}.`);
    const want = focusAfterLoad.current;
    focusAfterLoad.current = null;
    const target = want && want.key === committedKey ? store.rows[want.index] : undefined;
    if (want && target) {
      focusRow.current = target.id;
      scrollToIndex(want.index);
    }
  }, [store.pages, store.rows, count, scrollToIndex, committedKey]);
  // Focus the requested row as soon as it's mounted.
  useLayoutEffect(() => {
    const id = focusRow.current;
    if (!id) return;
    const row = scroller.current?.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
    const target = row?.querySelector<HTMLElement>('a') ?? row?.querySelector<HTMLElement>('input');
    if (!target) return;
    focusRow.current = null;
    target.focus();
  });
  useEffect(() => {
    if (store.status === 'error') setAnnouncement("Não foi possível carregar mais contatos. Tente novamente.");
  }, [store.status]);

  if (visible.length === 0 && !stale) {
    const filtered = Boolean(shownFilter.pool || shownFilter.q || shownFilter.tag);
    return (
      <EmptyState
        icon={Users}
        title={filtered ? 'Nenhum contato corresponde aos filtros' : 'Nenhum contato cadastrado'}
        description={
          filtered
            ? 'Ajuste a pesquisa ou adicione pessoas a este grupo pelo banco de talentos.'
            : 'Cadastre um candidato ou compartilhe a página de vagas para receber candidaturas.'
        }
      />
    );
  }

  // A total only describes the committed list.
  const shownTotal = !cached && !stale && count ? count : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {ids.length ? (
        <div className={`${surface} flex flex-wrap items-center gap-3 px-4 py-2.5`}>
          <span className="text-xs font-medium tabular-nums text-ink-2">
            {fmt(ids.length)} selecionados{shownTotal ? ` of ${fmt(shownTotal.count)}${shownTotal.capped ? '+' : ''}` : ''}
          </span>
          {staticPools.length ? (
            <span className="flex items-center gap-2">
              <span className="w-44">
                <FormSelect
                  placeholder="Adicionar à lista…"
                  value={targetPool}
                  onChange={setTargetPool}
                  options={staticPools.map((p) => ({ value: p.id, label: p.name }))}
                />
              </span>
              <button
                disabled={!targetPool}
                onClick={() => addToPool(targetPool)}
                className={buttonClass({ variant: 'tonal', size: 'sm' })}
              >
                Adicionar
              </button>
            </span>
          ) : (
            <span className="text-xs text-ink-2">Crie uma lista para adicionar candidatos.</span>
          )}
          {currentPoolId && currentPoolStatic && !cached ? (
            <button
              onClick={() => removeFromPool(currentPoolId)}
              className={buttonClass({ variant: 'ghost', size: 'sm', className: 'hover:text-critical' })}
            >
              Retirar desta lista
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The table is the only thing that scrolls; search and the pool bar stay put. */}
      <div
        ref={scroller}
        onScroll={(e) => {
          scrolled.current = e.currentTarget.scrollTop > 0;
        }}
        className={`${surface} relative min-h-0 flex-1 overflow-auto`}
      >
        {stale ? (
          <div
            role="progressbar"
            aria-label="Carregando contatos"
            className="list-progress sticky top-0 z-20 -mb-0.5 h-0.5 w-full overflow-hidden"
          />
        ) : null}
        <table
          aria-rowcount={shownTotal && !shownTotal.capped ? shownTotal.count + 1 : -1}
          aria-busy={stale || (!cached && store.status === 'loading') || undefined}
          data-loaded-count={visible.length}
          className={cn(
            'w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-sm transition-opacity duration-150 motion-reduce:transition-none',
            stale && 'opacity-60 delay-[120ms]',
          )}
        >
          <colgroup>
            <col className="w-12" />
            <col className="w-[26%]" />
            <col className="w-[23%]" />
            <col className="w-[32%]" />
            <col className="w-36" />
            <col className="w-32" />
          </colgroup>
          <thead>
            <tr className="text-left" aria-rowindex={1}>
              <th className={headCell}>
                <Checkbox
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? EMPTY : new Set(visible.map((r) => r.id)))}
                  aria-label={`Selecionar todos os ${fmt(visible.length)} registros carregados`}
                />
              </th>
              {['Nome', 'Cargo pretendido', 'Observação', 'Data de candidatura ↓', 'Etapa'].map((h) => (
                <th key={h} className={`${headCell} text-xs font-medium text-ink-2`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            onFocus={(e) => {
              const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-row-id]');
              if (tr?.dataset.rowId) setFocusedId(tr.dataset.rowId);
            }}
          >
            {slots.map((slot) =>
              slot.kind === 'gap' ? (
                <tr key={slot.key} aria-hidden="true" style={{ height: slot.height }}>
                  <td colSpan={6} className="p-0" />
                </tr>
              ) : (
                <ContactRowView
                  key={slot.row.id}
                  row={slot.row}
                  index={slot.index}
                  selected={selected.has(slot.row.id)}
                  onToggle={toggle}
                />
              ),
            )}
          </tbody>
        </table>
        <LoadMore
          scrollerRef={scroller}
          hasMore={cached ? cached.hasMore : store.hasMore}
          status={cached ? 'idle' : store.status}
          loaded={visible.length}
          total={shownTotal ? shownTotal.count : null}
          capped={shownTotal?.capped}
          noun="contacts"
          href={
            !cached && store.endCursor
              ? `${listHref('/contacts', committedKey)}${committedKey ? '&' : '?'}after=${encodeURIComponent(store.endCursor)}`
              : null
          }
          onLoad={onLoad}
          disabled={nav.pending || !complete}
        />
        {after ? (
          <p className="px-4 pb-4">
            <Link href={listHref('/contacts', committedKey)} className="text-xs text-ink-2 underline">
              Voltar ao início
            </Link>
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

const headCell =
  'sticky top-0 z-10 h-11 whitespace-nowrap bg-surface px-4 shadow-[inset_0_-1px_0_var(--color-line)]';
const cell = 'h-[52px] truncate border-b border-line px-4 py-0';

type RowProps = {
  row: ContactRow;
  index: number;
  selected: boolean;
  onToggle: (id: string) => void;
};

/** Same contact data, even as a new object (a server render of rows already shown). */
function sameContact(a: ContactRow, b: ContactRow): boolean {
  if (a === b) return true;
  for (const k of Object.keys(a) as (keyof ContactRow)[]) {
    if (k === 'tags' ? a.tags.join('\u0000') !== b.tags.join('\u0000') : a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * One contact, memoized on its data so a checkbox toggle, an appended page
 * or a server render of the same rows re-renders only what changed.
 */
const ContactRowView = memo(
  ContactRowCells,
  (a: RowProps, b: RowProps) =>
    sameContact(a.row, b.row) &&
    a.index === b.index &&
    a.selected === b.selected &&
    a.onToggle === b.onToggle,
);

function ContactRowCells({ row: c, index, selected, onToggle }: RowProps) {
  return (
    <tr data-row-id={c.id} aria-rowindex={index + 2} className="transition-colors duration-[120ms] hover:bg-muted/60">
      <td className={cell}>
        <Checkbox checked={selected} onChange={() => onToggle(c.id)} aria-label={`Selecionar ${c.name}`} />
      </td>
      <td className={cell}>
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={c.name} seed={c.id} size={28} />
          <span className="min-w-0 truncate">
            <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
          </span>
        </span>
      </td>
      <td className={`${cell} text-ink-2`} title={c.desiredRole ?? c.headline ?? undefined}>{c.desiredRole ?? c.headline ?? '—'}</td>
      <td className={cell}>
        {c.observation ? <span className="block truncate text-ink-2" title={c.observation}>{c.observation}</span> : <span className="text-ink-3">—</span>}
      </td>
      <td className={`${cell} tabular-nums text-ink-2`}>{c.registeredAt ? new Date(c.registeredAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td>
      <td className={cell}>
        {c.latestStage ? <Badge tone={c.archived ? 'neutral' : undefined}>{c.latestStage === 'archived' ? 'Encerrado' : c.latestStage}</Badge> : <span className="text-ink-2">Banco de talentos</span>}
      </td>
    </tr>
  );
}
