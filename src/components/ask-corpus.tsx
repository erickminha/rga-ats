'use client';

import { appLocale } from '@/lib/i18n';
import { askError, searchBox } from '@/lib/i18n/pt-BR/navigation';
import { CandidateLink } from '@/components/candidate-link';
import { useState, useTransition } from 'react';
import { askCorpusAction } from '@/app/(app)/actions';
import type { CorpusAnswer } from '@/server/ai';
import { inputClass, btnSecondary, badge, sectionLabel, surface, noAutofill } from '@/components/form-controls';
import { Rise, StreamingText, TextSwap, ThinkingStates } from '@/components/ui/motion';
import { Bot } from '@/components/ui/bot';

/** Ask a question of every transcript, resume, and note in the database. Rendered only when AI is on. */
export function AskCorpus() {
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<CorpusAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mb-8">
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!question.trim()) return;
          startTransition(async () => {
            const res = await askCorpusAction(question);
            if ('error' in res) {
              setError(askError(res.error));
              setResult(null);
            } else {
              setResult(res);
              setError(null);
            }
          });
        }}
      >
        <input {...noAutofill}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={searchBox.pagePlaceholder}
          disabled={pending}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          className={btnSecondary}
        >
          <Bot state={pending ? 'working' : 'idle'} size={20} />
          <TextSwap>{pending ? searchBox.thinkingLabel : searchBox.ask}</TextSwap>
        </button>
      </form>

      {error ? <p role="alert" className="mt-2 text-sm text-critical">{error}</p> : null}

      {pending ? (
        <div className={`${surface} animate-fade-rise mt-3 p-5 text-sm`}>
          <ThinkingStates lines={searchBox.thinking} />
        </div>
      ) : result ? (
        <div className={`${surface} animate-fade-rise mt-3 p-5`}>
          <CorpusAnswerView result={result} />
        </div>
      ) : null}
    </div>
  );
}

const citationNumber = new Intl.NumberFormat(appLocale);

/** An answer and its cited sources. Shared by the Search page and the ask box. */
export function CorpusAnswerView({ result, onOpenSource }: { result: CorpusAnswer; onOpenSource?: () => void }) {
  return (
    <>
      <StreamingText text={result.answer} className="whitespace-pre-wrap text-sm" />
          {result.sources.length ? (
            <div className="mt-4">
              <p className={`${sectionLabel} mb-2`}>{searchBox.sources}</p>
              <div className="flex flex-col gap-2">
                {result.sources.map((s, i) => (
                  <Rise key={i} i={i + 4} className="flex items-start gap-2">
                    <span className={`${badge} shrink-0`}>
                      {citationNumber.format(i + 1)} · {searchBox.sourceKinds[s.kind]}
                    </span>
                    <p className="min-w-0 text-xs text-ink-2">
                      {s.opportunityId ? (
                        <CandidateLink
                          id={s.opportunityId}
                          onClick={onOpenSource}
                          className="font-medium text-ink hover:underline"
                        >
                          {s.contactName}
                        </CandidateLink>
                      ) : (
                        <span className="font-medium text-ink">{s.contactName}</span>
                      )}{' '}
                      — {s.title}: “{s.snippet.slice(0, 160)}…”
                    </p>
                  </Rise>
                ))}
              </div>
            </div>
          ) : null}
    </>
  );
}
