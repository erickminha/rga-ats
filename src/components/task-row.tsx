'use client';

import { CandidateLink } from '@/components/candidate-link';
import { useOptimistic, useTransition } from 'react';
import { setTaskCompletedAction } from '@/app/(app)/actions';
import { Checkbox } from '@/components/ui/checkbox';
import { taskDateLabel } from '@/lib/task-dates';
import { runOptimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';

export function TaskRow({
  task,
}: {
  task: {
    id: string;
    title: string;
    dueAt: string | null;
    completed: boolean;
    assigneeName: string | null;
    opportunityId: string | null;
    contactName: string | null;
  };
}) {
  const [, startTransition] = useTransition();
  const [completed, setCompleted] = useOptimistic(task.completed);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Checkbox
        checked={completed}
        onChange={() =>
          runOptimistic(
            startTransition,
            () => setCompleted(!completed),
            () => setTaskCompletedAction(task.id, !completed),
            completed ? 'Reabrindo a tarefa' : 'Concluindo a tarefa',
          )
        }
        aria-label={`${completed ? 'Reabrir' : 'Concluir'} tarefa ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('break-words text-sm', completed && 'text-ink-2 line-through')}>{task.title}</p>
        {task.contactName && task.opportunityId ? (
          <CandidateLink
            id={task.opportunityId}
            className="text-xs text-ink-2 transition-colors duration-[120ms] hover:text-ink"
          >
            {task.contactName}
          </CandidateLink>
        ) : null}
      </div>
      <span className="text-xs text-ink-2">
        {task.assigneeName ? `${task.assigneeName} · ` : ''}
        {task.dueAt
          ? taskDateLabel(task.dueAt)
          : 'sem prazo'}
      </span>
    </div>
  );
}
