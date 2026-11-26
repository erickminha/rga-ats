'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { createTask, updateTask } from '@/server/tasks';
import { taskDate } from '@/lib/task-dates';

export type TaskFormState={error?:string;message?:string};

export async function saveCentralTask(_prev:TaskFormState,form:FormData):Promise<TaskFormState> {
  const ctx=await requireSession();
  const id=String(form.get('id')??'');
  const title=String(form.get('title')??'').trim();
  if(!title||title.length>300)return {error:'Informe um título com até 300 caracteres.'};
  try{
    const raw=String(form.get('dueAt')??'');
    const input={title,assigneeId:String(form.get('assigneeId')??'')||undefined,dueAt:raw?taskDate(raw):undefined};
    const task=id?await updateTask(ctx,id,input):await createTask(ctx,{...input,opportunityId:String(form.get('opportunityId')??'')||undefined});
    revalidatePath('/tasks');revalidatePath('/pipeline/operacao');
    if(task.opportunityId)revalidatePath('/candidates/'+task.opportunityId);
    return {message:id?'Tarefa atualizada.':'Tarefa cadastrada.'};
  }catch{return {error:'Não foi possível salvar. Confira prazo, responsável e acesso à participação.'};}
}
