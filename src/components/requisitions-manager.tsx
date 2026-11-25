'use client';

import { useState, useActionState, useTransition } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import {
  createRequisitionAction,
  setRequisitionStateAction,
  type FormState,
} from '@/app/(app)/actions';
import { Field, btnGhost, btnTonal, inputClass, surface, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Badge, type Tone } from '@/components/ui/primitives';
import { TextSwap } from '@/components/ui/motion';
import { Checkbox } from '@/components/ui/checkbox';

const STATE_TONES: Record<string, Tone> = {
  OPEN: 'positive',
  ON_HOLD: 'caution',
  CLOSED: 'neutral',
};

const STATE_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  ON_HOLD: 'Em espera',
  CLOSED: 'Encerrada',
};

export type RequisitionItem = {
  id: string;
  code: string;
  title: string;
  state: string;
  openings: number;
  filled: number;
  backfill: boolean;
  postingCount: number;
};

export function RequisitionsManager({ requisitions }: { requisitions: RequisitionItem[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createRequisitionAction,
    undefined,
  );
  const [statePending, startTransition] = useTransition();

  return (
    <section className="mx-6 mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-md font-medium text-ink">Requisições</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            As contratações em vagas vinculadas são contabilizadas na requisição.
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <Plus /> {open ? "Cancelar" : 'Nova requisição'}
        </button>
      </div>

      {open ? (
        <form action={formAction} className={`${surface} mb-3 flex flex-col gap-4 p-5`}>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Código">
              <input {...noAutofill} name="code" required placeholder="ENG-042" className={inputClass} />
            </Field>
            <Field label="Título">
              <input {...noAutofill} name="title" required placeholder="Analista de engenharia" className={inputClass} />
            </Field>
            <Field label="Posições">
              <input {...noAutofill} name="openings" type="number" min="1" defaultValue="1" className={inputClass} />
            </Field>
            <Field label="Reposição">
              <label className="flex h-9 items-center gap-2 text-sm text-ink-2">
                <Checkbox name="backfill" />
                Reposição de pessoal
              </label>
            </Field>
          </div>
          {state?.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className={btnTonal}>
              <TextSwap>{pending ? "Criando…" : 'Criar requisição'}</TextSwap>
            </button>
          </div>
        </form>
      ) : null}

      {requisitions.length ? (
        <div className={`${surface} divide-y divide-line`}>
          {requisitions.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <ClipboardList size={16} className="shrink-0 text-ink-2" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono text-xs text-ink-2">{r.code}</span> {r.title}
                    {r.backfill ? <span className="ml-1.5 text-xs text-ink-2">(reposição)</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2 tabular-nums">
                    {r.filled}/{r.openings} preenchidas · {r.postingCount} vagas
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={STATE_TONES[r.state] ?? 'neutral'}>
                  {STATE_LABELS[r.state] ?? 'Situação não informada'}
                </Badge>
                {r.state !== 'CLOSED' ? (
                  <button
                    disabled={statePending}
                    onClick={() =>
                      startTransition(() =>
                        setRequisitionStateAction(r.id, r.state === 'OPEN' ? 'ON_HOLD' : 'OPEN'),
                      )
                    }
                    className={btnGhost}
                  >
                    {r.state === 'OPEN' ? 'Colocar em espera' : 'Reabrir'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : !open ? (
        <p className="text-sm text-ink-2">Nenhuma requisição cadastrada.</p>
      ) : null}
    </section>
  );
}
