'use client';

import { organization } from '@/lib/i18n/pt-BR/organization';
import { useActionState } from 'react';
import { createCandidateAction, type FormState } from '@/app/(app)/actions';
import { Field, btnPrimary, inputClass, noAutofill } from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';
import { TextSwap } from '@/components/ui/motion';

export function NewCandidateForm({
  stages,
  postings,
  initialPosting,
  initialStage,
}: {
  stages: { id: string; name: string }[];
  postings: { id: string; title: string }[];
  initialPosting?: string;
  initialStage?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCandidateAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo">
          <input {...noAutofill} name="name" required placeholder="Ex.: Ana Souza" className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input {...noAutofill} name="email" type="email" placeholder="nome@exemplo.com" className={inputClass} />
        </Field>
        <Field label="Cargo ou área">
          <input {...noAutofill} name="headline" placeholder="Designer de Produto Sênior" className={inputClass} />
        </Field>
        <Field label="Localidade">
          <input {...noAutofill} name="location" placeholder="Ex.: Manaus, AM" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vaga">
          <FormSelect
            name="postingId"
            defaultValue={initialPosting ?? ''}
            options={[
              { value: '', label: 'Sem vaga vinculada' },
              ...postings.map((p) => ({ value: p.id, label: p.title })),
            ]}
          />
        </Field>
        <Field label="Etapa">
          <FormSelect
            name="stageId"
            defaultValue={initialStage ?? stages[0]?.id}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Origem">
          <FormSelect
            name="origin"
            defaultValue="SOURCED"
            options={[
              { value: 'SOURCED', label: 'Prospecção' },
              { value: 'APPLIED', label: 'Candidatura' },
              { value: 'REFERRED', label: 'Indicação' },
              { value: 'AGENCY', label: organization.kinds.AGENCY.title },
              { value: 'INTERNAL', label: 'Interna' },
              { value: 'UNIVERSITY', label: 'Universidade' },
            ]}
          />
        </Field>
        <Field label="Fonte">
          <input {...noAutofill} name="source" placeholder="Ex.: LinkedIn, indicação…" className={inputClass} />
        </Field>
      </div>

      <Field label="Currículo (opcional, até 5 MB)">
        <input name="resume" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt" className={inputClass} />
      </Field>

      {state?.error ? (
        <p className="rounded-field bg-critical/10 px-3 py-2 text-sm text-critical">{state.error}</p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btnPrimary}>
          <TextSwap>{pending ? 'Cadastrando…' : 'Cadastrar candidato'}</TextSwap>
        </button>
      </div>
    </form>
  );
}
