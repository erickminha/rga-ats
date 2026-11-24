'use client';

import { useState, useActionState, useTransition, useOptimistic } from 'react';
import { ListTodo } from 'lucide-react';
import {
  createTaskAction,
  setTaskCompletedAction,
  type FormState,
} from '@/app/(app)/actions';
import {
  Field,
  btnGhost,
  btnPrimary,
  inputClass,
  surface,
  noAutofill,
} from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';
import { SectionHeader } from '@/components/ui/primitives';
import { TextSwap } from '@/components/ui/motion';
import { Checkbox } from '@/components/ui/checkbox';
import { runOptimistic } from '@/lib/optimistic';
import { LocalTime } from '@/components/local-time';

export type TaskItem = {
  id: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
  assigneeName: string | null;
};

export function TaskSection({
  opportunityId,
  teammates,
  tasks,
}: {
  opportunityId: string;
  teammates: { id: string; name: string }[];
  tasks: TaskItem[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTaskAction,
    undefined,
  );
  const [, startTransition] = useTransition();
  // Checked state flips the moment it's clicked; the server confirms behind it.
  const [doneOverrides, setDone] = useOptimistic<Record<string, boolean>, [string, boolean]>(
    {},
    (overrides, [id, done]) => ({ ...overrides, [id]: done }),
  );

  return (
    <section>
      <SectionHeader
        title="Tarefas"
        action={
          <button onClick={() => setOpen((v) => !v)} className={btnGhost}>
            <ListTodo /> {open ? "Cancelar" : 'Adicionar tarefa'}
          </button>
        }
      />

      {open ? (
        <form action={formAction} className={`${surface} mb-3 flex flex-col gap-3 p-5`}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <Field label="Tarefa">
            <input {...noAutofill}
              name="title"
              required
              placeholder="Consultar referências…"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prazo">
              <input {...noAutofill} type="date" name="dueAt" className={inputClass} />
            </Field>
            <Field label="Responsável">
              <FormSelect
                name="assigneeId"
                options={[
                  { value: '', label: 'Eu' },
                  ...teammates.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </Field>
          </div>
          {state?.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className={btnPrimary}>
              <TextSwap>{pending ? 'Adicionando…' : 'Adicionar tarefa'}</TextSwap>
            </button>
          </div>
        </form>
      ) : null}

      {tasks.length ? (
        <div className={`${surface} divide-y divide-line overflow-hidden`}>
          {tasks.map((t) => ({ ...t, completed: doneOverrides[t.id] ?? t.completed })).map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
            >
              <Checkbox
                checked={t.completed}
                onChange={() =>
                  runOptimistic(
                    startTransition,
                    () => setDone([t.id, !t.completed]),
                    () => setTaskCompletedAction(t.id, !t.completed),
                    t.completed ? 'Reabrindo a tarefa' : 'Concluindo a tarefa',
                  )
                }
              />
              <span className={`flex-1 text-sm ${t.completed ? 'text-ink-2 line-through' : ''}`}>
                {t.title}
              </span>
              <span className="shrink-0 text-xs text-ink-2">
                {t.assigneeName ? `${t.assigneeName} · ` : ''}
                {t.dueAt
                  ? <LocalTime date={t.dueAt} options={{ month: 'short', day: 'numeric' }} />
                  : ''}
              </span>
            </label>
          ))}
        </div>
      ) : !open ? (
        <p className="text-sm text-ink-2">Nenhuma tarefa cadastrada.</p>
      ) : null}
    </section>
  );
}
