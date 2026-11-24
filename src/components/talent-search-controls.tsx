'use client';

import { useActionState } from 'react';
import { reuseTalentsAction, saveTalentGroupAction } from '@/app/(app)/talent-search-actions';
import { btnPrimary, btnTonal, inputClass } from '@/components/form-controls';
import type { TalentFilters } from '@/lib/talent-search';

export function TalentGroupEditor({ id, name, dynamic, filters }: { id?: string; name?: string; dynamic?: boolean; filters: TalentFilters }) {
  const [state, action, pending] = useActionState(saveTalentGroupAction.bind(null, id ?? null), {});
  return <details className="rounded-field border border-line p-3">
    <summary className="cursor-pointer">{id ? 'Editar grupo selecionado' : 'Novo grupo ou segmento'}</summary>
    <form className="mt-3 grid gap-2" action={action}>
      <label className="grid gap-1">Nome do grupo <input className={inputClass} name="name" required maxLength={80} defaultValue={name} /></label>
      {!id && <label className="grid gap-1">Organização do grupo <select className={inputClass} name="kind">
        <option value="STATIC">Grupo manual</option><option value="DYNAMIC">Segmento com os filtros desta busca</option>
      </select></label>}
      {id && dynamic && Object.keys(filters).length > 0 && <label><input type="checkbox" name="applyFilters" /> Substituir regras pelos filtros desta busca</label>}
      {Object.entries(filters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <button className={btnTonal} disabled={pending}>Salvar grupo</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </details>;
}

export function TalentReuseForm({ postingId, stages, initialStage, children }: {
  postingId: string; stages: { id: string; name: string }[]; initialStage?: string; children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(reuseTalentsAction.bind(null, postingId), {});
  return <form action={action} className="grid gap-4">
    {children}
    <div className="grid gap-2 rounded-card border border-line bg-surface p-4">
      <label className="grid max-w-sm gap-1">Etapa inicial <select className={inputClass} name="stage" required defaultValue={initialStage ?? stages[0]?.id ?? ""}>
        <option value="">Selecione a etapa</option>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
      </select></label>
      <label><input type="checkbox" name="confirm" required /> Confirmo a inclusão na vaga. Esta ação não envia mensagens.</label>
      <button className={btnPrimary} disabled={pending}>{pending ? 'Incluindo…' : 'Adicionar selecionados à vaga'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </div>
  </form>;
}
