import Link from 'next/link';
import { CandidateLink } from '@/components/candidate-link';
import { ListTodo } from 'lucide-react';
import type { loadTasksPage } from '@/app/(app)/page-loaders';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { TaskRow } from '@/components/task-row';
import { CentralTaskForm } from '@/components/central-task-form';
import { surface,inputClass,btnPrimary } from '@/components/form-controls';
import { Avatar } from '@/components/ui/orb';
import { SectionHeader } from '@/components/ui/primitives';
import { LocalTime } from '@/components/local-time';
import { taskStatus } from '@/lib/task-dates';

const tabs={pending:'Pendentes',today:'Para hoje',overdue:'Em atraso',completed:'Concluídas',all:'Todas'};
export function TasksScreen({data}:{data:Awaited<ReturnType<typeof loadTasksPage>>}){
  const href=(status:string,page=1)=>'/tasks?'+new URLSearchParams({situacao:status,responsavel:data.assignee,busca:data.q,pagina:String(page)});
  return <div className="t-reveal">
    <PageHeader title="Tarefas" subtitle="Organize as atividades da RGA, com ou sem vínculo a um candidato."/>
    <div className="mx-4 sm:mx-6 mt-4 grid max-w-5xl gap-5 pb-8">
      <details open className={surface+' p-4'}>
        <summary className="cursor-pointer font-semibold">Nova tarefa</summary>
        <div className="mt-4"><CentralTaskForm staff={data.staff} opportunities={data.opportunities}/></div>
      </details>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['pending','today','overdue','completed'] as const).map(k=><Link key={k} href={href(k)} className={surface+' p-3'} aria-current={data.status===k?'page':undefined}>
          <p className="text-sm text-ink-2">{tabs[k]}</p><strong className={'text-2xl '+(k==='overdue'?'text-critical':'')}>{data.counts[k]}</strong>
        </Link>)}
      </div>
      <section className={surface+' grid gap-3 p-4'}>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <label className="grid gap-1 text-sm">Pesquisar<input name="busca" defaultValue={data.q} placeholder="Título da tarefa" className={inputClass}/></label>
          <label className="grid gap-1 text-sm">Situação<select name="situacao" defaultValue={data.status} className={inputClass}>{Object.entries(tabs).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Responsável<select name="responsavel" defaultValue={data.assignee} className={inputClass}><option value="">Todos</option><option value="me">Minhas tarefas</option>{data.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button className={btnPrimary}>Filtrar</button>
        </form>
        <p className="text-sm text-ink-2">{data.total} tarefa(s) · página {data.page} · <Link href="/tasks" className="underline">Limpar filtros</Link></p>
      </section>
      <section>
        <SectionHeader title={tabs[data.status as keyof typeof tabs]}/>
        {!data.tasks.length?<EmptyState icon={ListTodo} title="Nenhuma tarefa nesta visão" description="Cadastre uma tarefa acima ou altere os filtros."/>:
          <div className={surface+' divide-y divide-line'}>
            {data.tasks.map(t=>{
              const status=taskStatus(t.dueAt,t.completed,data.today);
              return <article key={t.id} className="grid gap-1 pb-3">
                <TaskRow task={t}/>
                <div className="px-4 flex flex-wrap gap-2 text-xs text-ink-2">
                  <span>{status==='overdue'?'Em atraso':status==='today'?'Vence hoje':t.completed?'Concluída':'Pendente'}</span>
                  <span>· {t.postingTitle??(t.opportunityId?'Participação sem vaga':'Tarefa geral')}</span>
                </div>
                <details className="mx-4 rounded-lg border border-line p-2">
                  <summary className="cursor-pointer text-sm">Editar tarefa</summary>
                  <div className="pt-3"><CentralTaskForm key={t.id+':'+t.title+':'+t.dueAt+':'+t.assigneeId} staff={data.staff} task={t}/></div>
                </details>
              </article>;
            })}
          </div>}
        <div className="mt-3 flex gap-4 text-sm">
          {data.page>1&&<Link href={href(data.status,data.page-1)} className="underline">Página anterior</Link>}
          {data.page*50<data.total&&<Link href={href(data.status,data.page+1)} className="underline">Próxima página</Link>}
        </div>
      </section>
      {data.snoozed.length>0&&<section>
        <SectionHeader title="Participações pausadas"/>
        <div className={surface+' divide-y divide-line overflow-hidden'}>
          {data.snoozed.map(o=><CandidateLink key={o.id} id={o.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 items-center gap-3"><Avatar name={o.name} size={28}/><span className="truncate text-sm font-medium">{o.name}</span></span>
            <p className="shrink-0 text-xs text-ink-2">até {o.snoozedUntil?<LocalTime date={o.snoozedUntil} options={{month:'short',day:'numeric'}}/>:'—'}</p>
          </CandidateLink>)}
        </div>
      </section>}
    </div>
  </div>;
}
