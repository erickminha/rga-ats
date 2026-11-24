'use client';

import { discDetails, discScale } from '@/lib/competency-assessment';
import { useState, useTransition } from 'react';
import { saveAssessmentAction } from '@/app/(app)/recruiting-actions';
import { discAxes, screeningLabels } from '@/lib/i18n/pt-BR/assessment';
import type { AssessmentPart } from '@/server/recruiting-assessment';
import { btnTonal, inputClass, surface, textareaClass } from '@/components/form-controls';

export function RecruitingAssessmentForm({ id, screening, disc, discComplete, discFileId, previousDiscs }: {
  id: string;
  screening: Record<string, string>;
  disc: Record<string, string>;
  discComplete: boolean;
  discFileId: string | null;
  previousDiscs?: { id: string; title: string }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const save = (part: AssessmentPart) => (form: FormData) => start(async () => {
    setMessage('');
    try {
      await saveAssessmentAction(id, part, form);
      setMessage('Registro salvo.');
    } catch {
      setMessage('Não foi possível salvar. Confira os campos. Para anexar o DISC, use um PDF de até 5 MB.');
    }
  });

  const scale = discScale(disc.scaleMin ?? '', disc.scaleMax ?? '');
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
      {disc.sourceOpportunityId && <p className="mt-2 text-sm">Resultado reaproveitado. <a className="underline" href={`/candidates/${disc.sourceOpportunityId}`}>Consultar registro original</a></p>}
      {scale && <div className="mt-3 grid gap-1" aria-label="Resultados DISC segundo a escala registrada">
        {discAxes.filter((axis) => Number.isFinite(scale.parse(disc[axis] || ''))).map((axis) => <div key={axis}>
          <p>{axis} · {disc[axis]}</p>
          <meter className="w-full" min={scale.min} max={scale.max} value={scale.parse(disc[axis])}
            aria-label={`Resultado ${axis} na escala de ${scale.min} a ${scale.max}`} />
        </div>)}
      </div>}
      <form className="mt-3 grid gap-3" action={save('disc')}>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1">Nome da escala<input className={inputClass} name="scaleName" defaultValue={disc.scaleName} /></label>
          <label className="grid gap-1">Mínimo<input className={inputClass} inputMode="decimal" name="scaleMin" defaultValue={disc.scaleMin} /></label>
          <label className="grid gap-1">Máximo<input className={inputClass} inputMode="decimal" name="scaleMax" defaultValue={disc.scaleMax} /></label>
        </div>
        {Object.entries(discDetails).map(([key, label]) => <label key={key} className="grid gap-1">{label}
          {key === 'date' ? <input type="date" className={inputClass} name={key} defaultValue={disc[key]} />
            : <textarea className={textareaClass} name={key} defaultValue={disc[key]} maxLength={4000} rows={2} />}
        </label>)}
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
      {!!previousDiscs?.length && <details className="mt-4">
        <summary>Consultar e reaproveitar avaliação anterior</summary>
        <ul className="mt-2 list-inside list-disc">{previousDiscs.map((item) => <li key={item.id}><a className="underline" href={`/candidates/${item.id}`}>{item.title}</a></li>)}</ul>
        <form className="mt-3 grid gap-3" action={save('disc')}>
          <label className="grid gap-1">Origem <select className={inputClass} name="reuseId" required>
            <option value="">Selecione a participação</option>{previousDiscs.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <label className="grid gap-1">Finalidade do reaproveitamento<textarea name="reusePurpose" className={textareaClass} required maxLength={500} /></label>
          <label><input type="checkbox" name="reuseConfirmed" required /> Confirmei autorização, validade e pertinência para esta vaga.</label>
          <button className={btnTonal} disabled={pending}>Reaproveitar resultado sem copiar o PDF</button>
        </form>
      </details>}
    </details>
    <p role="status" className="text-sm">{pending ? 'Salvando…' : message}</p>
  </section>;
}
