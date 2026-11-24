'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import {
  deleteNewsletterAction,
  previewNewsletterAction,
  saveNewsletterAction,
  sendTestNewsletterAction,
  startNewsletterAction,
} from '@/app/(app)/newsletters/actions';
import { inputClass, noAutofill, sectionLabel, textareaClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Chip } from '@/components/ui/primitives';

type Posting = { id: string; title: string; location: string | null };

/**
 * Compose a newsletter: subject, message, the roles to feature, and a live
 * preview of the email itself (rendered on the server, with the brand kit).
 * Sending to everyone takes a second click that says how many people.
 */
export function NewsletterEditor({
  initial,
  postings,
  audience,
  canSend,
  isAdmin,
}: {
  initial: { id: string | null; subject: string; body: string; postingIds: string[] };
  postings: Posting[];
  audience: number;
  /** False when this server can't deliver email: nothing would leave it. */
  canSend: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [postingIds, setPostingIds] = useState(initial.postingIds);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [html, setHtml] = useState('');
  const input = { subject, body, postingIds };
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setNote(null);
    setConfirming(false);
  };

  // The preview follows the text, half a second behind
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await previewNewsletterAction({ subject, body, postingIds });
      if (res.ok && mine === seq.current) setHtml(res.html);
    }, 500);
    return () => clearTimeout(t);
  }, [subject, body, postingIds]);

  /** Save when there's something to save; the id afterwards. */
  const save = async (): Promise<string | null> => {
    if (id && !dirty) return id;
    const res = await saveNewsletterAction(id, input);
    if (!res.ok) {
      setNote({ tone: 'error', text: res.error });
      return null;
    }
    setDirty(false);
    if (!id) {
      setId(res.id);
      window.history.replaceState(null, '', `/newsletters/${res.id}`);
    }
    return res.id;
  };

  const togglePosting = (pid: string) => edit(setPostingIds)(postingIds.includes(pid) ? postingIds.filter((p) => p !== pid) : [...postingIds, pid]);

  const run = (task: () => Promise<void>) => start(task);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className={sectionLabel}>Assunto</span>
          <input {...noAutofill} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} placeholder="New roles at Northwind this month" className={inputClass} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={sectionLabel}>Mensagem</span>
          <textarea
            value={body}
            onChange={(e) => edit(setBody)(e.target.value)}
            rows={10}
            placeholder={'Hi {{first_name}},\n\nWe’re hiring again, and thought of you. Here’s what’s open right now.'}
            className={textareaClass}
          />
          <span className="text-xs text-ink-3">
            Use uma linha em branco para iniciar outro parágrafo. <code className="font-mono">{'{{first_name}}'}</code> é substituído pelo primeiro nome de cada destinatário.
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>Vagas em destaque</span>
          {postings.length ? (
            <div className="flex flex-wrap gap-2">
              {postings.map((p) => (
                <Chip key={p.id} selected={postingIds.includes(p.id)} onClick={() => togglePosting(p.id)}>
                  {postingIds.includes(p.id) ? <Check size={13} /> : null}
                  {p.title}
                  {p.location ? <span className="text-ink-3">· {p.location}</span> : null}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-2">Nenhuma vaga publicada. O e-mail ainda pode incluir o link para o portal.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-6">
          {!canSend ? (
            <p className="text-sm text-caution">O envio de e-mails está indisponível. Você pode salvar o comunicado como rascunho.</p>
          ) : !isAdmin ? (
            <p className="text-sm text-ink-2">Apenas administradores podem disparar o comunicado. Salve para que um administrador faça o envio.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending || (!dirty && !!id)} onClick={() => run(async () => void (await save()))} className={buttonClass({ variant: 'secondary' })}>
              {id && !dirty ? "Salvo" : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={pending || !canSend}
              onClick={() =>
                run(async () => {
                  const saved = await save();
                  if (!saved) return;
                  const res = await sendTestNewsletterAction(saved);
                  setNote(res.ok ? { tone: 'ok', text: `A test copy is on its way to ${res.sentTo}.` } : { tone: 'error', text: res.error });
                })
              }
              className={buttonClass({ variant: 'tonal' })}
            >
              Enviar teste para mim
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const saved = await save();
                      if (!saved) return;
                      const res = await startNewsletterAction(saved);
                      if (!res.ok) return setNote({ tone: 'error', text: res.error });
                      router.push(`/newsletters/${saved}`);
                      router.refresh();
                    })
                  }
                  className={buttonClass({ variant: 'primary' })}
                >
                  {pending ? "Enviando…" : `Yes, send to ${audience.toLocaleString()}`}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={buttonClass({ variant: 'ghost' })}>
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending || !canSend || !isAdmin || !audience || !subject.trim() || !body.trim()}
                onClick={() => setConfirming(true)}
                className={buttonClass({ variant: 'primary' })}
              >
                Enviar para {audience.toLocaleString()} {audience === 1 ? 'candidate' : "candidatos"}
              </button>
            )}
          </div>
          {confirming ? <p className="text-sm text-ink-2">O envio começa imediatamente e não pode ser desfeito.</p> : null}
          {note ? <p className={note.tone === 'error' ? 'text-sm text-critical' : 'text-sm text-ink-2'}>{note.text}</p> : null}
          {id ? (
            <form action={deleteNewsletterAction.bind(null, id)}>
              <button type="submit" className="text-xs text-ink-3 underline underline-offset-2 hover:text-ink-2">
                Excluir rascunho
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <p className={`${sectionLabel} mb-2`}>Prévia</p>
        <div className="overflow-hidden rounded-card bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] lg:sticky lg:top-6">
          <div className="border-b border-line px-4 py-3 text-sm">
            <span className="text-ink-3">Assunto</span> <span className="text-ink">{subject.replace(/\{\{\s*first_name\s*\}\}/g, 'Alex') || '—'}</span>
          </div>
          {/* the email's own HTML, sandboxed: no scripts, no navigation */}
          <iframe title="Prévia do e-mail" sandbox="" srcDoc={html} className="block h-[640px] w-full bg-white" />
        </div>
      </div>
    </div>
  );
}
