'use client';

import { useActionState } from 'react';
import { requestPortalLinkAction, type ApplyFormState } from '@/app/careers/actions';
import { Field, inputLgClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { TextSwap } from '@/components/ui/motion';

export function StatusRequestForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState<ApplyFormState, FormData>(
    requestPortalLinkAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Field label={candidate.email}>
        <input name="email" type="email" required autoComplete="email" className={inputLgClass} />
      </Field>
      {state?.error ? <p role="alert" className="text-sm text-critical">{state.error}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass({ variant: 'primary', size: 'lg', className: 'mt-2 w-full' })}>
        <TextSwap>{pending ? candidate.statusSending : candidate.statusSend}</TextSwap>
      </button>
    </form>
  );
}
