'use client';

import { organization } from '@/lib/i18n/pt-BR/organization';
import { useActionState } from 'react';
import type { Posting } from '@prisma/client';
import { createPostingAction, updatePostingDetailsAction, type FormState } from '@/app/(app)/actions';
import {
  Field,
  btnPrimary,
  inputClass,
  textareaClass,
  noAutofill,
} from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';
import { TextSwap } from '@/components/ui/motion';

export function NewPostingForm({
  isAgency,
  groups,
  initialClientId,
  initialPosting,
}: {
  isAgency?: boolean;
  initialClientId?: string;
  groups?: { id: string; name: string }[];
  initialPosting?: Pick<Posting, 'id' | 'title' | 'location' | 'workplaceType' | 'commitment' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'> & { description: string };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    initialPosting ? updatePostingDetailsAction.bind(null, initialPosting.id) : createPostingAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Título">
        <input {...noAutofill} name="title" required defaultValue={initialPosting?.title} placeholder="Analista de RH" className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        {!initialPosting ? <Field label={isAgency ? organization.client.singular : organization.department.singular}>
          <FormSelect
            name={isAgency ? 'clientCompanyId' : 'departmentId'}
            defaultValue={initialClientId ?? ''}
            options={[
              { value: '', label: isAgency ? organization.client.none : organization.department.none },
              ...(groups ?? []).map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </Field> : null}
        <Field label="Localidade">
          <input {...noAutofill} name="location" defaultValue={initialPosting?.location ?? ''} placeholder="Recife, PE" className={inputClass} />
        </Field>
        <Field label="Modalidade">
          <FormSelect
            name="workplaceType"
            defaultValue={initialPosting?.workplaceType ?? 'HYBRID'}
            options={[
              { value: 'ONSITE', label: 'Presencial' },
              { value: 'HYBRID', label: 'Híbrida' },
              { value: 'REMOTE', label: 'Remota' },
            ]}
          />
        </Field>
        <Field label="Tipo de contratação">
          <FormSelect
            name="commitment"
            defaultValue={initialPosting?.commitment ?? 'FULL_TIME'}
            options={[
              { value: 'FULL_TIME', label: 'Tempo integral' },
              { value: 'PART_TIME', label: 'Meio período' },
              { value: 'CONTRACT', label: 'Contrato' },
              { value: 'INTERNSHIP', label: 'Estágio' },
            ]}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Salário mínimo">
          <input {...noAutofill} name="salaryMin" defaultValue={initialPosting?.salaryMin ?? ''} type="number" min="0" placeholder="120000" className={inputClass} />
        </Field>
        <Field label="Salário máximo">
          <input {...noAutofill} name="salaryMax" defaultValue={initialPosting?.salaryMax ?? ''} type="number" min="0" placeholder="160000" className={inputClass} />
        </Field>
        <Field label="Moeda">
          <input {...noAutofill} name="salaryCurrency" defaultValue={initialPosting?.salaryCurrency ?? ''} placeholder="BRL" className={inputClass} />
        </Field>
      </div>

      <Field label="Descrição">
        <textarea {...noAutofill}
          name="description"
          defaultValue={initialPosting?.description}
          rows={6}
          placeholder="Descreva as atividades e os requisitos da vaga"
          className={textareaClass}
        />
      </Field>

      {state?.error ? (
        <p className="rounded-field bg-critical/10 px-3 py-2 text-sm text-critical">{state.error}</p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btnPrimary}>
          <TextSwap>{pending ? 'Salvando…' : initialPosting ? 'Salvar alterações' : 'Criar rascunho'}</TextSwap>
        </button>
      </div>
    </form>
  );
}
