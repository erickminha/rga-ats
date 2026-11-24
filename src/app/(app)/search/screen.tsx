import Link from 'next/link';
import { CandidateLink } from '@/components/candidate-link';
import { Search } from 'lucide-react';
import type { loadSearchPage } from '@/app/(app)/page-loaders';
import { AskCorpus } from '@/components/ask-corpus';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/orb';
import { inputClass, btnPrimary, badge, sectionLabel, surface, noAutofill } from '@/components/form-controls';
import { Bot } from '@/components/ui/bot';

export function SearchScreen({ data }: { data: Awaited<ReturnType<typeof loadSearchPage>> }) {
  const total =
    data.results.contacts.length +
    data.results.postings.length +
    data.results.notes.length +
    data.results.transcripts.length;

  return (
    <div className="t-reveal">
      <PageHeader title="Buscar" subtitle="Contatos, currículos, anotações, transcrições e vagas" />

      <div className="mx-6 mt-2 max-w-3xl">
        {data.aiEnabled ? (
          <>
            <p className={`${sectionLabel} mb-2 flex items-center gap-2`}>
              <Bot size={20} /> Consultar IA com os registros disponíveis
            </p>
            <AskCorpus />
            <p className={`${sectionLabel} mb-2`}>Buscar por palavra-chave</p>
          </>
        ) : null}
        <form method="get" className="mb-8 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input {...noAutofill}
              type="search"
              name="q"
              aria-label="Buscar por palavra-chave"
              defaultValue={data.q}
              autoFocus
              placeholder="Nome, e-mail, etiqueta, palavra do currículo ou anotação…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button type="submit" className={btnPrimary}>
            Buscar
          </button>
        </form>

        {data.q.trim().length >= 2 && total === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum resultado"
            description={`Nothing found for “${data.q}” across contacts, resumes, notes, or postings.`}
          />
        ) : null}

        {data.results.contacts.length ? (
          <section className="mb-8">
            <h2 className={`${sectionLabel} mb-3`}>Candidatos</h2>
            {data.results.more.contacts ? (
              <p className="mb-2 text-xs text-ink-2">
                Exibindo os primeiros {data.results.contacts.length} contatos, em ordem alfabética.{' '}
                <Link href={`/contacts?q=${encodeURIComponent(data.q.trim())}`} className="underline hover:text-ink">
                  Ver todos os nomes e títulos correspondentes no banco de talentos
                </Link>
              </p>
            ) : null}
            <div className={`${surface} divide-y divide-line`}>
              {data.results.contacts.map((c) => (
                <Link
                  key={c.id}
                  href={c.opportunityId ? `/candidates/${c.opportunityId}` : '/contacts'}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                >
                  <Avatar name={c.name} seed={c.id} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-ink-2">
                      {[c.headline, c.email].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className={badge}>{c.match === 'resume' ? 'resume match' : 'profile'}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {data.results.transcripts.length ? (
          <section className="mb-8">
            <h2 className={`${sectionLabel} mb-3`}>
              Transcrições{data.results.more.transcripts ? ` · ${data.results.transcripts.length} most recent matches` : ''}
            </h2>
            <div className={`${surface} divide-y divide-line`}>
              {data.results.transcripts.map((t, i) => (
                <CandidateLink
                  key={i}
                  id={t.opportunityId}
                  className="block px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                >
                  <p className="text-sm font-medium">
                    {t.contactName} <span className="font-normal text-ink-2">· {t.title}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2">{t.snippet}</p>
                </CandidateLink>
              ))}
            </div>
          </section>
        ) : null}

        {data.results.notes.length ? (
          <section className="mb-8">
            <h2 className={`${sectionLabel} mb-3`}>
              Anotações{data.results.more.notes ? ` · ${data.results.notes.length} most recent matches` : ''}
            </h2>
            <div className={`${surface} divide-y divide-line`}>
              {data.results.notes.map((n, i) => (
                <CandidateLink
                  key={i}
                  id={n.opportunityId}
                  className="block px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                >
                  <p className="text-sm font-medium">{n.contactName}</p>
                  <p className="mt-0.5 text-xs text-ink-2">{n.snippet}</p>
                </CandidateLink>
              ))}
            </div>
          </section>
        ) : null}

        {data.results.postings.length ? (
          <section className="mb-8">
            <h2 className={`${sectionLabel} mb-3`}>
              Vagas{data.results.more.postings ? ` · first ${data.results.postings.length}, by title` : ''}
            </h2>
            <div className={`${surface} divide-y divide-line`}>
              {data.results.postings.map((p) => (
                <Link
                  key={p.id}
                  href={`/postings/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                >
                  <p className="text-sm font-medium">{p.title}</p>
                  <span className={badge}>{p.state.toLowerCase()}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
