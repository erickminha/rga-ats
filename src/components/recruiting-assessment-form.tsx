'use client';

import { useState, useTransition } from 'react';
import { saveAssessmentAction } from '@/app/(app)/recruiting-actions';
import { discAxes, opinionFields, screeningLabels } from '@/lib/i18n/pt-BR/assessment';
import type { AssessmentPart } from '@/server/recruiting-assessment';
import { btnTonal, inputClass, surface, textareaClass } from '@/components/form-controls';

export function RecruitingAssessmentForm({ id, screening, disc, discComplete, discFileId, opinion, author, finalized }: {
  id: string;
  screening: Record<string, string>;
  disc: Record<string, string>;
  discComplete: boolean;
  discFileId: string | null;
  opinion: Record<string, string>;
  author: string | null;
  finalized: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const save = (part: AssessmentPart) => (form: FormData) => start(async () => {
    setMessage('');
    try {
      await saveAssessmentAction(id, part, form);
      setMessage(part === 'opinion' && form.get('intent') === 'finalize' ? 'Parecer finalizado.' : 'Registro salvo.');
    } catch {
      setMessage('Não foi possível salvar. Confira os campos. Para anexar o DISC, use um PDF de até 5 MB.');
    }
  });

  return <section className="mt-6 grid gap-4" aria-label="Avaliações da participação">
    <details className={`${surface} p-4`}>
      <summary className="cursor-pointer font-medium">Triagem</summary>
      <form className="mt-3 grid gap-3" action={save('screening')}>
        <label className="grid gap-1">Resultado
          <select name="result" className={inputClass} defaultValue={screening.result || ''}>
            <option value="">Pendente</option>
            {Object.entries(screeningLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Observações <textarea name="notes" className={textareaClass} maxLength={4000} defaultValue={screening.notes} /></label>
        <button className={btnTonal} disabled={pending}>Salvar triagem</button>
      </form>
    </details>
    <details className={`${surface} p-4`}>
      <summary className="cursor-pointer font-medium">Avaliação DISC · {discComplete ? 'Concluída' : 'Pendente'}</summary>
      <form className="mt-3 grid gap-3" action={save('disc')}>
        <label className="grid gap-1">Resultado recebido <input name="result" className={inputClass} maxLength={500} defaultValue={disc.result} /></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {discAxes.map((axis) => <label key={axis} className="grid gap-1">{axis}
            <input name={axis} className={inputClass} maxLength={40} defaultValue={disc[axis]} />
          </label>)}
        </div>
        <label className="grid gap-1">Observações internas <textarea name="notes" className={textareaClass} maxLength={4000} defaultValue={disc.notes} /></label>
        <label className="grid gap-1">Anexar relatório em PDF <input name="report" type="file" accept="application/pdf,.pdf" /></label>
        {discFileId && <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/files/${discFileId}`} className="underline">Baixar relatório DISC</a>
          <label><input type="checkbox" name="removeReport" /> Remover relatório</label>
        </div>}
        <label><input type="checkbox" name="complete" defaultChecked={discComplete} /> Avaliação concluída</label>
        <button className={btnTonal} disabled={pending}>Salvar DISC</button>
      </form>
    </details>
    <details className={`${surface} p-4`}>
      <summary className="cursor-pointer font-medium">Parecer · {finalized ? 'Finalizado' : 'Rascunho'}</summary>
      <form className="mt-3 grid gap-3" action={save('opinion')}>
        {author && <p className="text-sm">Responsável pelo parecer: {author}</p>}
        {Object.entries(opinionFields).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}
          <textarea name={key} className={textareaClass} maxLength={4000} defaultValue={opinion[key]} />
        </label>)}
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="draft" className={btnTonal} disabled={pending}>Salvar rascunho</button>
          <button name="intent" value="finalize" className={btnTonal} disabled={pending}>Finalizar parecer</button>
        </div>
      </form>
    </details>
    <p role="status" className="text-sm">{pending ? 'Salvando…' : message}</p>
  </section>;
}
