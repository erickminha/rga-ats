'use client';

import { useState, type ReactNode } from 'react';
import { saveReferenceQuestionnaire, updateReferenceCheck } from '@/app/(app)/reference-actions';
import { btnTonal, inputClass, surface, textareaClass } from '@/components/form-controls';
import { referenceChannels, referenceFields, referenceSources, referenceStatuses, type ReferenceAnswer } from '@/lib/professional-references';
import { WhatsappComposer } from '@/components/rga-productivity';

type Reference = Record<keyof typeof referenceFields, string> & {
  id: string; registeredBy: string; revoked: boolean; answers: ReferenceAnswer[];
  attempts: { id: string; at: string; channel: string; result: string; actor: string }[];
};

function ReferenceForm({ action, children }: { action: (form: FormData) => Promise<void>; children: ReactNode }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  return <form className="grid gap-2" action={async form => {
    setBusy(true);
    try { await action(form); setNotice('Registro salvo.'); }
    catch { setNotice('Não foi possível salvar. Revise os campos, a autorização e o estado atual do registro.'); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="grid min-w-0 gap-2">{children}</fieldset>
    <p role="status" className="text-sm">{busy ? 'Salvando…' : notice}</p>
  </form>;
}

export function ReferenceQuestionnaireForm({ questions }: { questions: string[] }) {
  return <ReferenceForm action={saveReferenceQuestionnaire}>
    <label className="grid gap-1">Uma pergunta por linha, limitada à experiência profissional
      <textarea className={textareaClass} name="questions" rows={12} required maxLength={4000} defaultValue={questions.join('\n')} />
    </label>
    <button className={btnTonal}>Salvar questionário</button>
  </ReferenceForm>;
}

function ReferenceInputs({ item }: { item?: Reference }) {
  return Object.entries(referenceFields).map(([key, label]) => <label className="grid gap-1 text-sm" key={key}>{label}
    {key === 'channel' ? <select name={key} className={inputClass} defaultValue={item?.channel ?? ''}>
      <option value="">Não informado</option>{referenceChannels.map(option => <option key={option}>{option}</option>)}
    </select> : <input className={inputClass} name={key} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
      required={key === 'name'} defaultValue={item?.[key as keyof typeof referenceFields]} maxLength={key === 'notes' ? 1000 : key === 'authorization' ? 500 : 160} />}
  </label>);
}

export function ProfessionalReferences({ id, status, responsible, references, questions, brand, job, history }: {
  id: string; status: keyof typeof referenceStatuses; responsible?: string; references: Reference[]; questions: string[]; brand: string; job: string;
  history: { id: string; at: string; actor: string; status: keyof typeof referenceStatuses }[];
}) {
  const active = references.filter(item => !item.revoked);
  const last = references.flatMap(item => item.attempts).sort((a, b) => b.at.localeCompare(a.at))[0];
  const format = (at: string) => new Date(at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return <details id="referencias" className={surface + ' min-w-0 p-4'}>
    <summary className="cursor-pointer font-medium">Referências profissionais · {active.length} · {referenceStatuses[status]}</summary>
    <div className="mt-3 grid gap-4">
      <p className="text-sm">Responsável: {responsible ?? 'Sem registro'} · Último contato: {last ? format(last.at) : 'Sem registro'}</p>
      <ReferenceForm action={updateReferenceCheck.bind(null, id, 'status')}>
        <label className="grid gap-1">Situação da verificação
          <select name="status" className={inputClass} key={status} defaultValue={status}>{Object.entries(referenceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <button className={btnTonal}>Atualizar situação</button>
      </ReferenceForm>
      {!!history.length && <details>
        <summary>Histórico da verificação</summary>
        <ul className="text-sm">{history.map(entry => <li key={entry.id}>{format(entry.at)} · {referenceStatuses[entry.status]} · {entry.actor}</li>)}</ul>
      </details>}
      <details>
        <summary className="cursor-pointer">Cadastrar referência</summary>
        <ReferenceForm action={updateReferenceCheck.bind(null, id, 'create')}>
          <ReferenceInputs />
          <button className={btnTonal}>Cadastrar referência</button>
        </ReferenceForm>
      </details>
      {references.map(item => <details key={item.id} className="min-w-0 rounded-xl border border-line p-3">
        <summary className="cursor-pointer break-words">{item.revoked ? 'Referência revogada' : item.name + (item.company ? ' · ' + item.company : '')}</summary>
        {!item.revoked && <>
          <dl className="my-3 grid gap-2 break-words text-sm sm:grid-cols-2">
            {Object.entries(referenceFields).map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd>{item[key as keyof typeof referenceFields] || 'Não informado'}</dd></div>)}
            <div><dt className="font-medium">Registrada por</dt><dd>{item.registeredBy}</dd></div>
          </dl>
          <details className="my-3">
            <summary>Editar cadastro da referência</summary>
            <ReferenceForm action={updateReferenceCheck.bind(null, id, 'edit')}>
              <input type="hidden" name="referenceId" value={item.id} />
              <ReferenceInputs item={item} />
              <button className={btnTonal}>Salvar dados da referência</button>
            </ReferenceForm>
          </details>
          {item.authorization && <>
            <WhatsappComposer opportunityId={id} name={item.name} job={job} brand={brand} phones={[item.phone]} status="" approved={false} referenceId={item.id} />
            <details className="my-3">
              <summary>Registrar tentativa de contato</summary>
              <ReferenceForm action={updateReferenceCheck.bind(null, id, 'attempt')}>
                <input type="hidden" name="referenceId" value={item.id} />
                <label className="grid gap-1">Data e hora de Brasília<input className={inputClass} name="occurredAt" type="datetime-local" required /></label>
                <label className="grid gap-1">Canal<select className={inputClass} name="channel">{referenceChannels.map(option => <option key={option}>{option}</option>)}</select></label>
                <label className="grid gap-1">Resultado<select className={inputClass} name="result">{['Sem resposta', 'Resposta recebida', 'Retorno combinado', 'Contato indisponível'].map(option => <option key={option}>{option}</option>)}</select></label>
                <button className={btnTonal}>Salvar tentativa</button>
              </ReferenceForm>
            </details>
          </>}
          <details className="my-3">
            <summary>Questionário de verificação</summary>
            <ReferenceForm action={updateReferenceCheck.bind(null, id, 'answers')}>
              <input type="hidden" name="referenceId" value={item.id} />
              <input type="hidden" name="questionnaire" value={JSON.stringify(questions)} />
              {questions.map((question, index) => {
                const answer = item.answers.find(row => row.question === question);
                return <fieldset className="grid min-w-0 gap-1 border-b border-line pb-2" key={question}>
                  <legend className="font-medium">{question}</legend>
                  <label className="grid gap-1">Origem ou situação
                    <select className={inputClass} name={'source_' + index} defaultValue={answer?.source ?? ''}>
                      <option value="">Sem resposta registrada</option>
                      {Object.entries(referenceSources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  <textarea className={textareaClass} name={'answer_' + index} aria-label={'Resposta profissional · ' + question} maxLength={800} defaultValue={answer?.text} />
                </fieldset>;
              })}
              <button className={btnTonal}>Salvar respostas</button>
            </ReferenceForm>
          </details>
          <ReferenceForm action={updateReferenceCheck.bind(null, id, 'revoke')}>
            <input type="hidden" name="referenceId" value={item.id} />
            <button className={btnTonal} onClick={event => {
              if (!window.confirm('Revogar o contato e remover os dados desta referência do cadastro? As versões emitidas do parecer são preservadas.')) event.preventDefault();
            }}>Revogar e remover dados</button>
          </ReferenceForm>
        </>}
        <h3 className="mt-3 font-medium">Histórico de contatos</h3>
        {item.attempts.length ? <ul className="text-sm">{item.attempts.map(attempt => <li key={attempt.id}>{format(attempt.at)} · {attempt.channel} · {attempt.result} · {attempt.actor}</li>)}</ul>
          : <p className="text-sm">Sem tentativas registradas.</p>}
      </details>)}
    </div>
  </details>;
}
