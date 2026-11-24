'use client';

import { appLocale } from '@/lib/i18n';
import { useState, useActionState, useTransition } from 'react';
import { FileSignature } from 'lucide-react';
import {
  createOfferAction,
  sendOfferAction,
  setOfferStatusAction,
  type FormState,
} from '@/app/(app)/actions';
import {
  Field,
  btnGhost,
  btnPrimary,
  inputClass,
  surface,
  textareaClass,
  noAutofill,
} from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { Badge, SectionHeader, type Tone } from '@/components/ui/primitives';
import { TextSwap } from '@/components/ui/motion';
import { CopyButton } from '@/components/ui/copy-button';
import { LocalTime } from '@/components/local-time';

const DEFAULT_LETTER = `Dear {{candidate_name}},

We are delighted to offer you the position of {{job_title}} at {{company_name}}.

Your compensation will be {{salary}}{{equity_clause}}. Your anticipated start date is {{start_date}}.

This offer{{expiry_clause}} is contingent on any background or reference checks we have discussed, and this letter does not constitute a contract of employment for any specific period.

We would be thrilled to have you on the team. To accept, review this letter and sign below.

Warmly,
{{company_name}}`;

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'caution',
  SENT: 'info',
  ACCEPTED: 'positive',
  DECLINED: 'critical',
  WITHDRAWN: 'critical',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovação",
  SENT: "Enviada",
  ACCEPTED: "Aceita",
  DECLINED: "Recusada",
  WITHDRAWN: "Retirada",
};

const NEXT_ACTIONS: Record<string, { label: string; status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'DRAFT' }[]> = {
  DRAFT: [{ label: "Retirar proposta", status: 'WITHDRAWN' }],
  PENDING_APPROVAL: [{ label: "Retirar proposta", status: 'WITHDRAWN' }],
  SENT: [
    { label: "Aceita", status: 'ACCEPTED' },
    { label: "Recusada", status: 'DECLINED' },
    { label: "Retirar proposta", status: 'WITHDRAWN' },
  ],
  ACCEPTED: [],
  DECLINED: [],
  WITHDRAWN: [],
};

export type OfferItem = {
  id: string;
  status: string;
  jobTitle: string;
  salaryAmount: number | null;
  salaryCurrency: string;
  equity: string | null;
  startDate: string | null;
  notes: string | null;
  createdAt: string;
  offerUrl: string | null;
  signedName: string | null;
  signedAt: string | null;
};

export function OfferSection({
  opportunityId,
  archived,
  offers,
  canApprove = false,
  approvalRequired = false,
}: {
  opportunityId: string;
  archived: boolean;
  offers: OfferItem[];
  canApprove?: boolean;
  approvalRequired?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createOfferAction,
    undefined,
  );
  const [statusPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section>
      <SectionHeader
        title="Propostas"
        action={
          !archived ? (
            <button onClick={() => setOpen((v) => !v)} className={btnGhost}>
              <FileSignature /> {open ? "Cancelar" : "Criar proposta"}
            </button>
          ) : null
        }
      />

      {open ? (
        <form action={formAction} className={`${surface} mb-3 flex flex-col gap-3 p-5`}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <Field label="Cargo">
            <input {...noAutofill} name="jobTitle" required placeholder="Designer de Produto Sênior" className={inputClass} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Salário-base">
              <input {...noAutofill} name="salaryAmount" type="number" min="0" placeholder="150000" className={inputClass} />
            </Field>
            <Field label="Moeda">
              <input {...noAutofill} name="salaryCurrency" placeholder="BRL" defaultValue="BRL" className={inputClass} />
            </Field>
            <Field label="Data de início">
              <input {...noAutofill} name="startDate" type="date" className={inputClass} />
            </Field>
          </div>
          <Field label="Participação societária (opcional)">
            <input {...noAutofill} name="equity" placeholder="0.05%" className={inputClass} />
          </Field>
          <Field label="Observações (opcional)">
            <textarea {...noAutofill} name="notes" rows={2} className={textareaClass} />
          </Field>
          <Field label="Carta-proposta">
            <textarea {...noAutofill}
              name="letterBody"
              rows={8}
              defaultValue={DEFAULT_LETTER}
              className={textareaClass}
            />
          </Field>
          <p className="text-xs text-ink-2">
            Os campos são preenchidos com os dados acima quando o candidato abre o link:{' '}
            {'{{candidate_name}} {{job_title}} {{company_name}} {{salary}} {{equity_clause}} {{start_date}} {{expiry_clause}}'}
          </p>
          {state?.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className={btnPrimary}>
              <TextSwap>{pending ? "Criando…" : "Criar rascunho de proposta"}</TextSwap>
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mb-2 text-sm text-critical">{error}</p> : null}
      {notice ? <p className="mb-2 text-sm text-ink-2">{notice}</p> : null}

      {offers.length ? (
        <div className={`${surface} divide-y divide-line`}>
          {offers.map((o) => (
            <div key={o.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={STATUS_TONES[o.status]}>
                  {STATUS_LABELS[o.status] ?? o.status.toLowerCase()}
                </Badge>
                <span className="text-xs text-ink-2">
                  <LocalTime date={o.createdAt} options={{ year: 'numeric', month: 'numeric', day: 'numeric' }} />
                </span>
              </div>
              <p className="mt-2 text-sm font-medium">{o.jobTitle}</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {o.salaryAmount || o.equity || o.startDate ? (
                  [
                    // Use the same locale on the server and in the browser.
                    o.salaryAmount ? o.salaryAmount.toLocaleString(appLocale, { style: 'currency', currency: /^[A-Z]{3}$/.test(o.salaryCurrency) ? o.salaryCurrency : 'BRL' }) : null,
                    o.equity ? `${o.equity} equity` : null,
                    o.startDate ? (
                      <>
                        início <LocalTime date={o.startDate} options={{ month: 'short', day: 'numeric' }} />
                      </>
                    ) : null,
                  ]
                    .filter(Boolean)
                    .map((part, i) => (
                      <span key={i}>
                        {i ? ' · ' : ''}
                        {part}
                      </span>
                    ))
                ) : (
                  "Condições ainda não registradas"
                )}
              </p>
              {o.notes ? <p className="mt-1.5 whitespace-pre-wrap text-sm">{o.notes}</p> : null}
              {o.signedName ? (
                <p className="mt-1.5 text-sm text-ink-2">
                  Assinada <span className="italic">{o.signedName}</span>
                  {o.signedAt ? (
                    <>
                      {' · '}
                      <LocalTime date={o.signedAt} />
                    </>
                  ) : null}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {(o.status === 'DRAFT' || o.status === 'SENT') && o.offerUrl ? (
                  <button
                    disabled={statusPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await sendOfferAction(o.id, opportunityId);
                        setError(result.error ?? null);
                        setNotice(
                          result.pendingApproval
                            ? 'Sent for approval — an admin will review before the candidate sees it.'
                            : null,
                        );
                      })
                    }
                    className={buttonClass({ variant: 'tonal', size: 'xs' })}
                  >
                    {o.status === 'DRAFT'
                      ? approvalRequired && !canApprove
                        ? "Solicitar aprovação"
                        : "Enviar ao candidato"
                      : "Reenviar link"}
                  </button>
                ) : null}
                {o.status === 'PENDING_APPROVAL' && canApprove ? (
                  <>
                    <button
                      disabled={statusPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await sendOfferAction(o.id, opportunityId);
                          setError(result.error ?? null);
                          setNotice(null);
                        })
                      }
                      className={buttonClass({ variant: 'tonal', size: 'xs' })}
                    >
                      Aprovar e enviar
                    </button>
                    <button
                      disabled={statusPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await setOfferStatusAction(o.id, opportunityId, 'DRAFT');
                          setError(result.error ?? null);
                        })
                      }
                      className={buttonClass({ variant: 'ghost', size: 'xs' })}
                    >
                      Reprovar
                    </button>
                  </>
                ) : null}
                {o.offerUrl && o.status !== 'DRAFT' && o.status !== 'PENDING_APPROVAL' ? (
                  <CopyButton text={() => `${window.location.origin}${o.offerUrl}`} label="Copiar link da proposta" />
                ) : null}
                {(NEXT_ACTIONS[o.status] ?? []).map((a) => (
                  <button
                    key={a.status}
                    disabled={statusPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await setOfferStatusAction(o.id, opportunityId, a.status);
                        setError(result.error ?? null);
                      })
                    }
                    className={buttonClass({ variant: 'ghost', size: 'xs' })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !open ? (
        <p className="text-sm text-ink-2">Nenhuma proposta registrada.</p>
      ) : null}
    </section>
  );
}