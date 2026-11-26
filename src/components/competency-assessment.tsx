'use client';

import { useState, useTransition } from 'react';
import { saveCompetencyInterviewAction, saveCompetencyTemplateAction, savePostingCompetenciesAction } from '@/app/(app)/recruiting-actions';
import { btnTonal, inputClass, surface, textareaClass } from '@/components/form-controls';
import { defaultScale, ratedAverage, recommendationLabels, requirementLabels, type CompetencyPlan, type InterviewReview, type Template } from '@/lib/competency-assessment';

function useSave(action: (form: FormData) => Promise<void>) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return { pending, message, save: (form: FormData) => start(async () => {
    try { await action(form); setMessage('Registro salvo.'); }
    catch { setMessage('Não foi possível salvar. Confira os campos ou atualize a página.'); }
  }) };
}

export function CompetencyPlanForm({ postingId, plan, templates, orgQuestions, template }: {
  postingId?: string; plan?: CompetencyPlan | null; templates?: Template[]; orgQuestions?: string[]; template?: Template;
}) {
  const [questions, setQuestions] = useState((plan?.questions ?? template?.questions ?? []).join('\n'));
  const [scale, setScale] = useState((plan?.scale ?? template?.scale ?? defaultScale).join('\n'));
  const { pending, message, save } = useSave(postingId ? savePostingCompetenciesAction.bind(null, postingId) : saveCompetencyTemplateAction);
  return <form action={save} className="mt-3 grid gap-3">
    {!postingId && <>
      <input type="hidden" name="id" value={template?.id ?? ''} />
      <label className="grid gap-1">Nome do modelo<input className={inputClass} name="name" maxLength={100} defaultValue={template?.name} /></label>
    </>}
    {postingId && <label className="grid gap-1">Copiar modelo para esta vaga
      <select className={inputClass} defaultValue="" onChange={(event) => {
        const option = event.currentTarget.value;
        if (option === 'organization') { setQuestions((orgQuestions ?? []).join('\n')); setScale(defaultScale.join('\n')); }
        const selected = templates?.find((item) => item.id === option);
        if (selected) { setQuestions(selected.questions.join('\n')); setScale(selected.scale.join('\n')); }
      }}>
        <option value="">Selecione um modelo</option>
        {templates?.filter((item) => !item.inactive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        {!!orgQuestions?.length && <option value="organization">Perguntas do scorecard da organização</option>}
      </select>
    </label>}
    <label className="grid gap-1">Competências e perguntas (uma por linha, até 12)
      <textarea className={textareaClass} rows={4} name="questions" maxLength={3000} value={questions} onChange={(event) => setQuestions(event.target.value)} />
    </label>
    <label className="grid gap-1">Descrições das notas de 1 a 5 (uma por linha)
      <textarea className={textareaClass} rows={5} name="scale" maxLength={1000} value={scale} onChange={(event) => setScale(event.target.value)} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button className={btnTonal} disabled={pending}>Salvar {postingId ? 'roteiro da vaga' : 'modelo'}</button>
      {template && <>
        <button className={btnTonal} name="mode" value="duplicate" disabled={pending}>Duplicar modelo</button>
        <button className={btnTonal} name="mode" value="toggle" disabled={pending}>{template.inactive ? 'Reativar' : 'Desativar'}</button>
      </>}
    </div>
    <p role="status">{message}</p>
  </form>;
}

export function CompetencyInterviewForm({ id, plan, review, requirements, postingId }: {
  id: string; plan: CompetencyPlan | null; review: InterviewReview | null; requirements: { label: string }[]; postingId: string | null;
}) {
  const { pending, message, save } = useSave(saveCompetencyInterviewAction.bind(null, id));
  const activePlan = review ?? plan;
  const average = ratedAverage(review?.answers ?? []);
  return <details id="entrevista-competencias" className={`${surface} p-4`}>
    <summary className="cursor-pointer font-medium">Entrevista por competências · {review?.completed ? 'Concluída' : 'Pendente'}</summary>
    <form key={review?.savedAt} className="mt-3 grid gap-3" action={save}>
      <input type="hidden" name="revision" value={review?.savedAt ?? ''} />
      {!activePlan?.questions.length && <p>Esta participação está sem roteiro de competências. {postingId && <a href={`/postings/${postingId}#roteiro-avaliacao`} className="underline">Configurar na vaga</a>}</p>}
      {activePlan?.questions.map((question, i) => <fieldset key={question} className="grid gap-2 rounded-xl border border-line p-3">
        <legend className="px-1">{question}</legend>
        <label className="grid gap-1">Nota<select name={`score-${i}`} className={inputClass} defaultValue={review?.answers[i]?.score ?? ''}>
          <option value="">Não avaliado</option>
          {activePlan.scale.map((label, position) => <option key={position} value={position + 1}>{position + 1} — {label}</option>)}
        </select></label>
        <label className="grid gap-1">Resposta e exemplos<textarea name={`response-${i}`} className={textareaClass} maxLength={1500} defaultValue={review?.answers[i]?.response} /></label>
        <label className="grid gap-1">Evidências e observações<textarea name={`evidence-${i}`} className={textareaClass} maxLength={1500} defaultValue={review?.answers[i]?.evidence} /></label>
      </fieldset>)}
      {average !== null && <p>Média das competências avaliadas {average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de {activePlan?.scale.length}.</p>}
      {(review?.requirements ?? requirements).map(({ label }, i) => <label key={i} className="grid gap-1">{label}
        <select name={`requirement-${i}`} className={inputClass} defaultValue={review?.requirements[i]?.result ?? 'UNVERIFIED'}>
          {Object.entries(requirementLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select>
      </label>)}
      <label className="grid gap-1">Recomendação profissional<select name="recommendation" className={inputClass} defaultValue={review?.recommendation ?? ''}>
        <option value="">Pendente</option>
        {Object.entries(recommendationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="grid gap-1">Justificativa profissional<textarea name="justification" className={textareaClass} maxLength={2500} defaultValue={review?.justification} /></label>
      <label><input name="completed" type="checkbox" defaultChecked={review?.completed} /> Marcar entrevista por competências como concluída</label>
      <button className={btnTonal} disabled={pending}>Salvar entrevista por competências</button>
    </form>
    <p role="status">{message}</p>
  </details>;
}

type Comparison = { id: string; name: string; headline: string | null; experience: string; review: InterviewReview | null;
  interview: boolean; disc: boolean; opinion: boolean };
export function CompareFinalists({ finalists }: { finalists: Comparison[] }) {
  const [ids, setIds] = useState<string[]>([]);
  return <details className={`${surface} my-5 p-5`}>
    <summary className="cursor-pointer font-medium">Comparar finalistas</summary>
    <p className="mt-3 text-sm">{finalists.length ? 'Selecione até três finalistas.' : 'Nenhum finalista nesta vaga.'}</p>
    <div className="my-3 flex flex-wrap gap-3">
      {finalists.map((row) => <label key={row.id}><input type="checkbox" checked={ids.includes(row.id)} disabled={ids.length >= 3 && !ids.includes(row.id)}
        onChange={(event) => setIds(current => {
          if (!event.target.checked) return current.filter(id => id !== row.id);
          return current.length < 3 ? [...current, row.id] : current;
        })} /> {row.name}</label>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {finalists.filter((row) => ids.includes(row.id)).map((row) => <article key={row.id} className="grid content-start gap-2 rounded-xl border border-line p-3">
        <a href={`/candidates/${row.id}`} className="font-medium underline">{row.name}</a>
        <p>{row.headline || 'Cargo não informado'}</p>
        <p className="line-clamp-4">{row.experience || 'Experiência relevante não registrada'}</p>
        <p>Entrevista: {row.interview || row.review?.completed ? 'Concluída' : 'Pendente'}</p>
        <p>DISC: {row.disc ? 'Concluído' : 'Pendente'}</p>
        <p>Parecer: {row.opinion ? 'Finalizado' : 'Pendente'}</p>
        <p>Recomendação: {recommendationLabels[row.review?.recommendation as keyof typeof recommendationLabels] ?? 'Pendente'}</p>
        {row.review?.answers.map((answer, index) => <p key={index}>{row.review?.questions[index]}: {answer.score === null ? 'Não avaliado' : row.review?.scale[answer.score - 1]}</p>)}
        {row.review?.requirements.map((requirement) => <p key={requirement.label}>{requirement.label}: {requirementLabels[requirement.result as keyof typeof requirementLabels]}</p>)}
      </article>)}
    </div>
  </details>;
}
