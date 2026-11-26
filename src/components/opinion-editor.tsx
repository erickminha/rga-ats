'use client';

import { useState, useTransition } from 'react';
import { assistOpinionAction, saveAssessmentAction, saveCustomerFeedbackAction, saveOpinionTemplateAction } from '@/app/(app)/recruiting-actions';
import { btnTonal, inputClass, surface, textareaClass } from '@/components/form-controls';
import { assistedFields, customerFeedbackLabels, opinionKeys, type OpinionField, type OpinionTemplate } from '@/lib/professional-opinion';
import { opinionFields } from '@/lib/i18n/pt-BR/assessment';

export function OpinionTemplateForm({ template }: { template?: OpinionTemplate }) {
  const [message, setMessage] = useState('');
  return <form className="grid gap-2" action={async (form) => {
    try { await saveOpinionTemplateAction(form); setMessage('Modelo salvo.'); }
    catch { setMessage('Não foi possível salvar o modelo.'); }
  }}>
    <input type="hidden" name="id" value={template?.id ?? ''} />
    <label className="grid gap-1">Nome do modelo <input name="name" maxLength={100} className={inputClass} defaultValue={template?.name} /></label>
    <h3 className="font-medium">Seções do parecer</h3>
    {opinionKeys.map((key) => <label key={key}><input name="section" type="checkbox" value={key}
      defaultChecked={template?.sections.includes(key) ?? key !== 'complementary'} disabled={key === 'recommendation'} /> {opinionFields[key]}</label>)}
    <div className="flex flex-wrap gap-2">
      <button className={btnTonal}>Salvar modelo de parecer</button>
      {template && <>
        <button className={btnTonal} name="mode" value="duplicate">Duplicar modelo</button>
        <button className={btnTonal} name="mode" value="toggle">{template.inactive ? 'Reativar modelo' : 'Desativar modelo'}</button>
      </>}
    </div>
    <p role="status">{message}</p>
  </form>;
}

export function OpinionEditor({ id, templates, content, prefill, revision, issued, author, finalized, ai, referenceOptions = [] }: {
  id: string; templates: OpinionTemplate[]; content: Record<string, string>; prefill: Record<string, string>;
  revision: string; issued: { version: number; date: string }[]; author: string | null; finalized: boolean; ai: boolean;
  referenceOptions?: { id: string; text: string }[];
}) {
  const [fields, setFields] = useState(content);
  const [template, setTemplate] = useState(templates[0]?.id);
  const sections = opinionKeys.filter((key) => templates.find((item) => item.id === template)?.sections.includes(key) || !!fields[key]);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [suggestion, setSuggestion] = useState<{ key: OpinionField; text: string }>();
  const update = (key: string, value: string) => setFields((old) => ({ ...old, [key]: value }));
  return <details className={`${surface} p-4`}>
    <summary className="cursor-pointer font-medium">Parecer · {finalized ? 'Finalizado' : 'Rascunho'}</summary>
    {author && <p className="mt-2 text-sm">Responsável pela última edição — {author}</p>}
    {revision && <p className="text-sm">Última alteração — {new Date(revision).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
    <form className="mt-3 grid gap-3" action={(form) => start(async () => {
      try {
        await saveAssessmentAction(id, 'opinion', form);
        setMessage(form.get('intent') === 'finalize' ? 'Parecer finalizado.' : 'Rascunho salvo.');
      } catch { setMessage('Não foi possível salvar. Confira a recomendação e atualize a página se necessário.'); }
    })}>
      <input type="hidden" name="opinionRevision" value={revision} />
      <label className="grid gap-1">Modelo de parecer
        <select className={inputClass} value={template} onChange={(event) => setTemplate(event.target.value)}>
          {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button type="button" className={btnTonal} onClick={() => setFields((current) => {
        const result = { ...current };
        for (const key of sections) if (!result[key] && prefill[key]) result[key] = prefill[key];
        return result;
      })}>Preencher campos vazios com dados da participação</button>
      {!!referenceOptions.length && <details className="grid gap-2">
        <summary>Selecionar informações de referências</summary>
        {referenceOptions.map(option => <div className="flex flex-wrap items-start gap-2 py-2 text-sm" key={option.id}>
          <button type="button" className={btnTonal} disabled={fields.references?.includes(option.text) || (fields.references?.length ?? 0) + option.text.length + 1 > 4000}
            onClick={() => update('references', [fields.references, option.text].filter(Boolean).join('\n'))}>Incluir no parecer</button>
          <span className="min-w-0 break-words">{option.text}</span>
        </div>)}
      </details>}
      {sections.map((key) => <label key={key} className="grid gap-1 text-sm">{opinionFields[key]}
        <textarea name={key} rows={3} className={textareaClass} maxLength={4000} value={fields[key] ?? ''} onChange={(event) => update(key, event.target.value)} />
      </label>)}
      <div className="flex flex-wrap gap-2">
        <button name="intent" value="draft" className={btnTonal} disabled={pending}>Salvar rascunho</button>
        <button name="intent" value="finalize" className={btnTonal} disabled={pending}>Finalizar e emitir versão</button>
      </div>
    </form>
    {ai && <details className="mt-4">
      <summary>Assistência opcional de redação</summary>
      <form className="mt-2 grid gap-2" action={(form) => start(async () => {
        const key = String(form.get('section')) as OpinionField;
        try {
          const text = await assistOpinionAction(id, key, form);
          setSuggestion({ key, text });
        } catch { setMessage('Assistência indisponível. O texto do parecer pode ser editado manualmente.'); }
      })}>
        <label className="grid gap-1">Seção <select name="section" className={inputClass}>
          {assistedFields.filter((key) => sections.includes(key)).map((key) => <option key={key} value={key}>{opinionFields[key]}</option>)}
        </select></label>
        <label className="grid gap-1">Trecho já salvo nesta seção, sem dados pessoais
          <textarea name="source" required maxLength={4000} className={textareaClass} />
        </label>
        <label><input type="checkbox" name="confirmed" required /> Revisei o trecho e autorizo o envio ao fornecedor configurado.</label>
        <button className={btnTonal} disabled={pending}>Sugerir redação</button>
      </form>
      {suggestion && <div className="my-2 space-y-2">
        <p className="whitespace-pre-wrap">{suggestion.text}</p>
        <button type="button" className={btnTonal} onClick={() => { update(suggestion.key, suggestion.text); setSuggestion(undefined); }}>Copiar sugestão para revisão</button>
      </div>}
    </details>}
    {revision && <a className="mt-3 inline-block underline" target="_blank" rel="noreferrer" href={`/api/pareceres/${id}/preview`}>Visualizar PDF do rascunho salvo</a>}
    {!!issued.length && <section className="mt-4 grid gap-2">
      <h3 className="font-medium">Versões emitidas</h3>
      {issued.map(({ version, date }) => <p key={version} className="flex flex-wrap gap-2 text-sm">
        <span>Versão {version} · {date}</span>
        <a className="underline" target="_blank" rel="noreferrer" href={`/api/pareceres/${id}/${version}`}>Visualizar PDF</a>
        <a className="underline" href={`/api/pareceres/${id}/${version}?download`}>Baixar PDF</a>
      </p>)}
    </section>}
    <p className="mt-2 text-sm" role="status">{pending ? 'Aguarde…' : message}</p>
  </details>;
}

export type CustomerFeedback = { status: keyof typeof customerFeedbackLabels; notes: string; at: string; by?: string };
export function CustomerFeedbackForm({ postingId, id, name, history }: { postingId: string; id: string; name: string; history: CustomerFeedback[] }) {
  const [message, setMessage] = useState('');
  return <details className="rounded-xl border border-line p-3">
    <summary>{name} · {history.length ? customerFeedbackLabels[history[history.length - 1].status] : customerFeedbackLabels.WAIT}</summary>
    <form className="mt-3 grid gap-2" action={async (form) => {
      try { await saveCustomerFeedbackAction(postingId, id, form); setMessage('Retorno registrado.'); }
      catch { setMessage('Não foi possível registrar o retorno.'); }
    }}>
      <label>Situação <select name="status" className={inputClass}>
        {Object.entries(customerFeedbackLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="grid gap-1">Observações<textarea name="notes" maxLength={2000} className={textareaClass} /></label>
      <button className={btnTonal}>Registrar retorno</button>
    </form>
    <ul className="my-2 grid gap-2">{history.map((entry, index) => <li key={index}>
      {customerFeedbackLabels[entry.status]} · {new Date(entry.at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      {entry.by && <> · {entry.by}</>}
      {entry.notes && <p className="whitespace-pre-wrap text-sm">{entry.notes}</p>}
    </li>)}</ul>
    <p role="status">{message}</p>
  </details>;
}
