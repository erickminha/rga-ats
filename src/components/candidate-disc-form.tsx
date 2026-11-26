'use client';

import { useEffect, useState, useTransition } from 'react';
import { candidateDiscAction } from '@/app/avaliacao-disc/actions';
import { groups, instructions, validGroup } from '@/lib/native-disc';

type Draft = Extract<Awaited<ReturnType<typeof candidateDiscAction>>, { answers: number[][] }>;

export function CandidateDiscForm() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState<Draft>();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  useEffect(() => {
    let request = 0;
    const load = () => {
      const key = location.hash.slice(1);
      const current = ++request;
      setToken(key);
      setDraft(undefined);
      setDone(false);
      setError('');
      candidateDiscAction(key).then(result => {
        if (current !== request) return;
        if (result?.answers) {
          setDraft(result);
          setStep(Math.max(0, result.answers.findIndex(group => !validGroup(group))));
        } else if (result?.done) setDone(true);
        else setError(result?.error ?? 'Link inválido, expirado ou cancelado.');
      }).catch(() => {
        if (current === request) setError('Não foi possível abrir a avaliação. Recarregue a página.');
      });
    };
    load();
    window.addEventListener('hashchange', load);
    return () => { request++; window.removeEventListener('hashchange', load); };
  }, []);
  const completed = draft?.answers.filter(validGroup).length ?? 0;
  function move(target: number, submit = false) {
    if (!draft) return;
    start(async () => {
      setError('');
      try {
        const result = await candidateDiscAction(token, { answers: draft.answers, revision: draft.revision, submit });
        if (location.hash.slice(1) !== token) return;
        if (result?.done) setDone(true);
        else if (typeof result?.saved === 'number') {
          setDraft({ ...draft, revision: result.saved });
          setStep(target);
        } else setError(result?.error ?? 'O link expirou ou o limite temporário foi atingido.');
      } catch { if (location.hash.slice(1) === token) setError('Falha de conexão. Tente salvar novamente.'); }
    });
  }
  return <section className="rga-card grid gap-4 p-5">
    {draft?.organization.logoFileId && <img className="h-12 w-fit object-contain" alt={draft.organization.name} src={'/api/logo/' + draft.organization.logoFileId} />}
    <h1 className="text-2xl font-semibold">Avaliação DISC</h1>
    {error && <p role="alert">{error}</p>}
    {done ? <p role="status">Respostas enviadas. Obrigado por participar!</p> : draft ? <>
      <p>{draft.name} · {draft.title}</p>
      <p className="text-sm">{instructions}</p>
      <label className="grid gap-1 text-sm">{completed} de 10 grupos concluídos
        <progress className="w-full accent-[#1581C9]" value={completed} max={10} />
      </label>
      <fieldset disabled={busy} className="grid gap-3">
        <legend className="mb-2 font-semibold">Grupo {step + 1} de 10</legend>
        {groups[step].map((label, col) => <label key={label} className="flex items-center justify-between gap-3">
          {label}
          <select value={draft.answers[step][col]} className="rounded-field border border-line p-2" onChange={event => {
            const rank = Number(event.target.value);
            const answers = draft.answers.map((group, row) => row !== step ? group :
              group.map((old, index) => index === col ? rank : rank && old === rank ? 0 : old));
            setDraft({ ...draft, answers });
          }}>
            <option value={0}>Selecione</option>
            {[4, 3, 2, 1].map(rank => <option key={rank} value={rank}>{rank}</option>)}
          </select>
        </label>)}
      </fieldset>
      <p className="text-sm">Use cada valor uma vez. Ao reutilizar um valor, a escolha anterior fica em branco.</p>
      <div className="flex flex-wrap gap-4">
        <button className="underline" disabled={busy || step === 0} onClick={() => move(step - 1)}>Voltar</button>
        <button className="underline" disabled={busy} onClick={() => move(step)}>Salvar rascunho</button>
        {step < 9 ? <button className="rounded-field bg-[#116DA9] px-4 py-2 text-white disabled:opacity-45" disabled={busy || !validGroup(draft.answers[step])} onClick={() => move(step + 1)}>Próximo</button> :
          <button className="rounded-field bg-[#116DA9] px-4 py-2 text-white disabled:opacity-45" disabled={busy || completed !== 10} onClick={() => move(step, true)}>Concluir avaliação</button>}
      </div>
    </> : !error && <p role="status">Carregando avaliação…</p>}
  </section>;
}
