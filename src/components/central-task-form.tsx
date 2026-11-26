'use client';
import { useActionState } from 'react';
import { saveCentralTask, type TaskFormState } from '@/app/(app)/tasks/task-actions';
import { btnPrimary,inputClass } from '@/components/form-controls';

export function CentralTaskForm({staff,opportunities=[],task}:{
  staff:{id:string;name:string}[];
  opportunities?:{id:string;label:string}[];
  task?:{id:string;title:string;dueAt:string|null;assigneeId:string|null};
}){
  const [state,action,pending]=useActionState<TaskFormState,FormData>(saveCentralTask,{});
  return <form action={action} className="grid gap-3">
    {task&&<input type="hidden" name="id" value={task.id}/>}
    <label className="grid gap-1 text-sm">O que precisa ser feito?
      <input className={inputClass} name="title" required maxLength={300} defaultValue={task?.title??''} placeholder="Ex.: retornar ao cliente, conferir referências..."/>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Prazo<input className={inputClass} type="date" name="dueAt" defaultValue={task?.dueAt?.slice(0,10)??''}/></label>
      <label className="grid gap-1 text-sm">Responsável<select className={inputClass} name="assigneeId" defaultValue={task?.assigneeId??''}>
        <option value="">Eu</option>
        {task?.assigneeId&&!staff.some(s=>s.id===task.assigneeId)&&<option value={task.assigneeId} disabled>Responsável anterior (inativo)</option>}
        {staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
    </div>
    {!task&&<label className="grid gap-1 text-sm">Participação vinculada (opcional)
      <select name="opportunityId" className={inputClass}><option value="">Tarefa geral, sem candidato</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <span className="text-xs text-ink-2">Até 100 participações ativas recentes. Outras podem receber tarefas pela ficha do candidato.</span>
    </label>}
    {state.error&&<p role="alert" className="text-sm text-critical">{state.error}</p>}
    {state.message&&<p role="status" className="text-sm">{state.message}</p>}
    <button className={btnPrimary+' justify-self-start'} disabled={pending}>{pending?'Salvando…':task?'Salvar alterações':'Cadastrar tarefa'}</button>
  </form>;
}
