'use client';

import { useActionState } from 'react';
import { submitReferralAction, type FormState } from '@/app/(app)/actions';
import { Field, btnPrimary, inputClass, textareaClass, noAutofill } from '@/components/form-controls';
import { FormSelect } from '@/components/form-select';
import { TextSwap } from '@/components/ui/motion';

const RELATIONSHIPS = [
  { value: '', label: 'Select a relationship' },
  { value: 'worked-together', label: 'Worked together' },
  { value: 'managed', label: 'Managed them' },
  { value: 'reported-to', label: 'Reported to them' },
  { value: 'friend', label: 'Friend / acquaintance' },
  { value: 'other', label: 'Other' },
];

export function ReferralForm({
  postings,
}: {
  postings: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitReferralAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo">
          <input {...noAutofill} name="name" required placeholder="Dana Reyes" className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input {...noAutofill} name="email" type="email" required placeholder="dana@example.com" className={inputClass} />
        </Field>
        <Field label="Título profissional (opcional)">
          <input {...noAutofill} name="headline" placeholder="Designer de Produto Sênior" className={inputClass} />
        </Field>
        <Field label="Vaga">
          <FormSelect
            name="postingId"
            options={[
              { value: '', label: 'General (no specific role)' },
              ...postings.map((p) => ({ value: p.id, label: p.title })),
            ]}
          />
        </Field>
        <Field label="Como você conhece essa pessoa?">
          <FormSelect name="relationship" options={RELATIONSHIPS} />
        </Field>
      </div>
      <Field label="Por que você indica essa pessoa?">
        <textarea {...noAutofill}
          name="notes"
          rows={4}
          placeholder="Trabalhamos juntos. Tem boa capacidade analítica e conhece ferramentas de recrutamento."
          className={textareaClass}
        />
      </Field>
      {state?.error ? (
        <p className="rounded-field bg-critical/10 px-3 py-2 text-sm text-critical">{state.error}</p>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={btnPrimary}>
          <TextSwap>{pending ? "Enviando…" : 'Submit referral'}</TextSwap>
        </button>
      </div>
    </form>
  );
}
