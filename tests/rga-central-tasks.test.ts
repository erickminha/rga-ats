import {describe,it,expect} from 'vitest';
import {taskDate,taskDay,taskStatus,taskDateLabel} from '@/lib/task-dates';
import {createTask,setTaskCompleted,updateTask} from '@/server/tasks';
import {createOrg} from './fixtures';
import {hasDb} from './setup';
import {db} from '@/lib/db';

describe('Prazos de tarefas',()=>{
  it('usa dia de Brasília e não antecipa vencimento por UTC',()=>{
    expect(taskDay(new Date('2026-11-27T01:00:00Z'))).toBe('2026-11-26');
    expect(taskStatus('2026-11-26T00:00:00.000Z',false,'2026-11-26')).toBe('today');
    expect(taskStatus('2026-11-25T00:00:00.000Z',false,'2026-11-26')).toBe('overdue');
    expect(taskDateLabel(taskDate('2026-11-26').toISOString())).toBe('26/11/2026');
    expect(()=>taskDate('2026-02-30')).toThrow();
    expect(taskStatus(null,false,'2026-11-26')).toBe('pending');
    expect(taskStatus(null,true,'2026-11-26')).toBe('completed');
  });
});

describe.skipIf(!hasDb)('Central de tarefas',()=>{
  it('cria tarefa geral, edita, conclui, reabre e impede acesso cruzado',async()=>{
    const {org,admin}=await createOrg();
    const other=await createOrg();
    const ctx={orgId:org.id,userId:admin.id,accessRole:'ADMIN'};
    const t=await createTask(ctx,{title:'Retornar ao cliente',dueAt:taskDate('2026-11-26')});
    expect(t.opportunityId).toBeNull();expect(t.assigneeId).toBe(admin.id);
    await expect(updateTask({...ctx,orgId:other.org.id},t.id,{title:'Outro'})).rejects.toThrow();
    await expect(updateTask(ctx,t.id,{title:'Outro',assigneeId:other.admin.id})).rejects.toThrow();
    await expect(createTask({...ctx,accessRole:'INTERVIEWER'},{title:'Sem permissão'})).rejects.toThrow();
    await updateTask(ctx,t.id,{title:'Conferir retorno'});
    expect((await db.task.findUniqueOrThrow({where:{id:t.id}})).title).toBe('Conferir retorno');
    await setTaskCompleted(ctx,t.id,true);await setTaskCompleted(ctx,t.id,true);
    expect(await db.event.count({where:{orgId:org.id,verb:'task.completed',subjectId:t.id}})).toBe(1);
    await expect(setTaskCompleted({...ctx,orgId:other.org.id},t.id,false)).rejects.toThrow();
    expect((await setTaskCompleted(ctx,t.id,false)).completedAt).toBeNull();
  });
});
