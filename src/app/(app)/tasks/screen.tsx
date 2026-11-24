import { CandidateLink } from '@/components/candidate-link';
import { ListTodo } from 'lucide-react';
import type { loadTasksPage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { TaskRow } from '@/components/task-row';
import { surface } from '@/components/form-controls';
import { Avatar } from '@/components/ui/orb';
import { SectionHeader, StatusDot } from '@/components/ui/primitives';
import { LocalTime } from '@/components/local-time';

export function TasksScreen({ data }: { data: Awaited<ReturnType<typeof loadTasksPage>> }) {
  const now = new Date(data.now);
  const overdue = data.tasks.filter((t) => t.dueAt && new Date(t.dueAt) < now);
  const upcoming = data.tasks.filter((t) => !t.dueAt || new Date(t.dueAt) >= now);

  const renderList = (list: typeof data.tasks) => (
    <div className={`${surface} divide-y divide-line overflow-hidden`}>
      {list.map((t) => (
        <TaskRow
          key={t.id}
          task={{
            id: t.id,
            title: t.title,
            dueAt: t.dueAt,
            completed: false,
            assigneeName: t.assigneeName,
            opportunityId: t.opportunityId,
            contactName: t.contactName,
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="t-reveal">
      <PageHeader title="Tarefas" subtitle="Tarefas e participações pausadas da equipe" />

      <div className="mx-6 mt-4 flex max-w-3xl flex-col gap-8 pb-8">
        {data.tasks.length === 0 && data.snoozed.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="Nenhuma tarefa pendente"
            description="Tarefas cadastradas nos perfis e participações pausadas aparecem aqui."
          />
        ) : null}

        {overdue.length ? (
          <section>
            <SectionHeader
              title={
                <span className="flex items-center gap-2">
                  <StatusDot tone="critical" />
                  Em atraso
                </span>
              }
            />
            {renderList(overdue)}
          </section>
        ) : null}

        {upcoming.length ? (
          <section>
            <SectionHeader title="Tarefas pendentes" />
            {renderList(upcoming)}
          </section>
        ) : null}

        {data.snoozed.length ? (
          <section>
            <SectionHeader title="Participações pausadas" />
            <div className={`${surface} divide-y divide-line overflow-hidden`}>
              {data.snoozed.map((o) => (
                <CandidateLink
                  key={o.id}
                  id={o.id}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={o.name} size={28} />
                    <span className="truncate text-sm font-medium">{o.name}</span>
                  </span>
                  <p className="shrink-0 text-xs text-ink-2">
                    até{' '}
                    {o.snoozedUntil ? (
                      <LocalTime date={o.snoozedUntil} options={{ month: 'short', day: 'numeric' }} />
                    ) : (
                      '—'
                    )}
                  </p>
                </CandidateLink>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
