'use client';

import { useActionState } from 'react';
import { saveTalentProfileAction, changeTalentResumeAction, recordTalentPreferenceAction } from '@/app/(app)/talent-actions';
import { availabilityLabels, careerFields, statesBR } from '@/lib/talent-profile';
import { btnPrimary, btnTonal, inputClass, textareaClass } from '@/components/form-controls';

type Fields = Partial<Record<keyof typeof careerFields | 'name' | 'headline' | 'location' | 'email' | 'phone' | 'salary', string>>;

export function TalentProfileForm({ id, initial = {} }: { id?: string; initial?: Fields }) {
  const [state, action, pending] = useActionState(saveTalentProfileAction.bind(null, id ?? null), {});
  return <form action={action} className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1">Nome completo <input name="name" required maxLength={200} className={inputClass} defaultValue={initial.name} /></label>
      <label className="grid gap-1">E-mail <input type="email" name="email" maxLength={254} className={inputClass} defaultValue={initial.email} /></label>
      <label className="grid gap-1">Telefone <input type="tel" name="phone" maxLength={36} className={inputClass} defaultValue={initial.phone} /></label>
      <label className="grid gap-1">WhatsApp <input type="tel" name="whatsapp" maxLength={36} className={inputClass} defaultValue={initial.whatsapp} /></label>
      <label className="grid gap-1">Cidade ou localidade <input name="location" maxLength={180} className={inputClass} defaultValue={initial.location} /></label>
      <label className="grid gap-1">Estado (UF) <select name="state" className={inputClass} defaultValue={initial.state ?? ''}>
        <option value="">Não informado</option>{statesBR.map((uf) => <option key={uf}>{uf}</option>)}
      </select></label>
      <label className="grid gap-1">Cargo ou área profissional <input name="headline" maxLength={250} className={inputClass} defaultValue={initial.headline} /></label>
      <label className="grid gap-1">Escolaridade <input name="education" maxLength={180} className={inputClass} defaultValue={initial.education} /></label>
      <label className="grid gap-1">Pretensão salarial (R$) <input name="salary" inputMode="decimal" maxLength={20} className={inputClass} defaultValue={initial.salary} /></label>
      <label className="grid gap-1">Disponibilidade profissional <select name="availability" className={inputClass} defaultValue={initial.availability ?? ''}>
        <option value="">Não informada</option>{Object.entries(availabilityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <label className="grid gap-1">Competências <textarea name="skills" maxLength={5000} className={textareaClass} defaultValue={initial.skills} /></label>
    <label className="grid gap-1">Experiência profissional <textarea name="experience" maxLength={5000} className={textareaClass} defaultValue={initial.experience} /></label>
    <button className={btnPrimary} disabled={pending}>{pending ? 'Salvando…' : 'Salvar cadastro'}</button>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function TalentResumeControls({ id, documents, active }: {
  id: string;
  documents: { id: string; name: string }[];
  active: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(changeTalentResumeAction.bind(null, id), {});
  return <div className="grid gap-3">
    <form action={action} className="grid gap-2">
      <input type="hidden" name="operation" value="upload" />
      <label className="grid gap-1">Anexar currículo (até 5 MB) <input type="file" name="resume" required /></label>
      <label><input type="checkbox" name="confirmed" required /> Confirme se o documento pertence a este cadastro.</label>
      <button className={btnTonal} disabled={pending}>Anexar currículo</button>
    </form>
    {documents.length > 0 && <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="operation" value="select" />
      <label className="grid gap-1">Currículo <select name="fileId" className={inputClass}>
        {documents.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
      </select></label>
      <label className="grid gap-1">Usar como <select name="opportunityId" className={inputClass}>
        <option value="">Currículo principal do cadastro</option>
        {active.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <button className={btnTonal} disabled={pending}>Vincular currículo</button>
    </form>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </div>;
}

export function TalentPreferenceForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(recordTalentPreferenceAction.bind(null, id), {});
  return <details className="my-3">
    <summary className="cursor-pointer text-sm">Registrar preferência informada pelo titular</summary>
    <form action={action} className="mt-2 grid gap-2">
      <label className="grid gap-1">Preferência para futuras oportunidades
        <select name="preference" required defaultValue="" className={inputClass}>
          <option value="">Selecione</option>
          <option value="granted">O titular autorizou</option>
          <option value="withdrawn">O titular recusou ou retirou a autorização</option>
        </select>
      </label>
      <label><input type="checkbox" required name="verified" /> Confirmei esta preferência com o titular.</label>
      <button className={btnTonal} disabled={pending}>Registrar preferência</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </details>;
}
