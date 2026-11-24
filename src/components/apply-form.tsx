'use client';

import { useActionState, useId, useState } from 'react';
import { applyAction, type ApplyFormState } from '@/app/careers/actions';
import { Field, inputLgClass, selectClass, textareaClass } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { TextSwap } from '@/components/ui/motion';
import { Checkbox } from '@/components/ui/checkbox';
import { candidate, EEO_QUESTIONS } from '@/lib/i18n/pt-BR/candidate';

export function ApplyForm({
  orgSlug,
  postingSlug,
  networkOptIn,
  collectEeo = false,
  utm,
}: {
  orgSlug: string;
  postingSlug: string;
  networkOptIn: boolean;
  collectEeo?: boolean;
  utm?: { source?: string; medium?: string; campaign?: string };
}) {
  const resumeId = useId();
  const [resume, setResume] = useState<File | null>(null);
  const [storeProfile, setStoreProfile] = useState(false);
  const [joinNetwork, setJoinNetwork] = useState(false);
  const [fields, setFields] = useState({ name: '', email: '', location: '', linkedin: '', coverNote: '' });
  const [state, formAction, pending] = useActionState<ApplyFormState, FormData>((previous, form) => {
    if (resume) form.set('resume', resume);
    return applyAction(previous, form);
  }, undefined);
  const field = (key: keyof typeof fields) => ({
    name: key,
    value: fields[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setFields((current) => ({ ...current, [key]: value }));
    },
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="postingSlug" value={postingSlug} />
      {utm?.source ? <input type="hidden" name="utm_source" value={utm.source} /> : null}
      {utm?.medium ? <input type="hidden" name="utm_medium" value={utm.medium} /> : null}
      {utm?.campaign ? <input type="hidden" name="utm_campaign" value={utm.campaign} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={candidate.name}>
          <input {...field('name')} required autoComplete="name" className={inputLgClass} />
        </Field>
        <Field label={candidate.email}>
          <input {...field('email')} type="email" required autoComplete="email" className={inputLgClass} />
        </Field>
        <Field label={candidate.location}>
          <input {...field('location')} autoComplete="address-level2" placeholder="Ex.: Recife, PE" className={inputLgClass} />
        </Field>
        <Field label={candidate.profileLink}>
          <input {...field('linkedin')} type="url" placeholder="https://…" className={inputLgClass} />
        </Field>
      </div>

      <div className="grid gap-2">
        <label htmlFor={resumeId} className="text-sm font-medium">{candidate.resume}</label>
        <p id={resumeId + '-help'} className="text-xs text-ink-2">{candidate.resumeHelp}</p>
        <div className="flex flex-wrap items-center gap-3 rounded-field border border-line bg-canvas p-3">
          <input
            id={resumeId}
            name="resume"
            type="file"
            aria-describedby={resumeId + '-help ' + resumeId + '-name'}
            accept=".pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,text/rtf,text/plain"
            onChange={(event) => setResume(event.target.files?.[0] ?? null)}
            className="peer sr-only"
          />
          <label htmlFor={resumeId} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-2' })}>
            {candidate.chooseFile}
          </label>
          <span role="status" id={resumeId + '-name'} className="min-w-0 text-sm text-ink-2 [overflow-wrap:anywhere]">{resume?.name ?? candidate.noFile}</span>
          {resume ? <button type="button" className="text-sm underline" onClick={() => {
            const input = document.getElementById(resumeId) as HTMLInputElement | null;
            if (input) input.value = '';
            setResume(null);
          }}>Remover currículo</button> : null}
        </div>
      </div>

      <Field label={candidate.coverNote}>
        <textarea {...field('coverNote')} rows={4} placeholder="Conte brevemente sobre sua experiência." className={textareaClass} />
      </Field>

      <fieldset className="grid gap-3 border-t border-line pt-4">
        <legend className="pr-2 text-sm font-semibold">Privacidade e preferências</legend>
        <p className="text-sm text-ink-2">{candidate.privacy}{' '}
          <a href="/careers/privacidade" className="underline">Leia o aviso de privacidade</a>.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-field bg-muted p-3">
          <Checkbox name="storeProfile" checked={storeProfile} onChange={(event) => setStoreProfile(event.target.checked)} className="mt-0.5" />
          <span className="text-xs text-ink-2">
            <span className="block font-medium text-ink">{candidate.saveProfile}</span>
            {candidate.saveProfileDetail}
          </span>
        </label>
        {networkOptIn ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-field bg-muted p-3">
            <Checkbox name="networkOptIn" checked={joinNetwork} onChange={(event) => setJoinNetwork(event.target.checked)} className="mt-0.5" />
            <span className="text-xs text-ink-2">
              <span className="block font-medium text-ink">{candidate.discover}</span>
              {candidate.discoverDetail}
            </span>
          </label>
        ) : null}
      </fieldset>

      {collectEeo ? (
        <div className="pt-2">
          <p className="text-sm font-medium text-ink">Autodeclaração voluntária (EEO)</p>
          <p className="mt-1 text-xs text-ink-2">
            As respostas são opcionais, armazenadas separadamente do seu perfil e usadas apenas em relatórios agregados. Sua escolha não afeta a candidatura.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {EEO_QUESTIONS.map((q) => (
              <label key={q.name} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-2">{q.label}</span>
                <select name={q.name} defaultValue="declined" className={selectClass}>
                  <option value="declined">Prefiro não responder</option>
                  {Object.entries(q.options).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {state?.error ? (
        <p role="alert" className="rounded-field bg-critical/10 px-3 py-2 text-sm text-critical">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: 'primary', size: 'lg', className: 'mt-2 w-full' })}
      >
        <TextSwap>{pending ? candidate.applying : candidate.apply}</TextSwap>
      </button>
    </form>
  );
}
