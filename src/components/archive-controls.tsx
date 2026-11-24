'use client';

import { useState, useTransition } from 'react';
import type { ArchiveCategory, OpportunityStatus, StageType } from '@prisma/client';
import { archiveOpportunityAction, unarchiveOpportunityAction } from '@/app/(app)/actions';
import { SnoozeControl } from '@/components/snooze-control';
import { StageSelect } from '@/components/stage-select';
import { buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { outcomeNames } from '@/lib/i18n/pt-BR/recruiting';

export function CandidateStatusControls({ opportunityId, status, archiveReason, stageId, stages, snoozedUntil, reasons }: {
  opportunityId: string;
  status: OpportunityStatus;
  archiveReason: string | null;
  stageId: string;
  stages: { id: string; name: string; type: StageType }[];
  snoozedUntil: string | null;
  reasons: { id: string; name: string; category: ArchiveCategory }[];
}) {
  const [category, setCategory] = useState<ArchiveCategory>('REJECTION');
  const [message, setMessage] = useState('');
  const [pending, transition] = useTransition();
  const submit = (action: () => Promise<void>) => transition(async () => {
    setMessage('');
    try { await action(); } catch { setMessage('Não foi possível atualizar a participação. Confira os dados e tente novamente.'); }
  });
  return (
    <>
      {status === 'ACTIVE' && <>
        <StageSelect onSurface opportunityId={opportunityId} currentStageId={stageId} stages={stages} />
        <SnoozeControl opportunityId={opportunityId} snoozedUntil={snoozedUntil} />
        <details>
          <summary className="cursor-pointer text-sm">Encerrar participação</summary>
          <form className="mt-2 grid gap-2 rounded-field border border-line p-3" action={(form) => submit(() =>
            archiveOpportunityAction(opportunityId, String(form.get('reason')), String(form.get('note') ?? ''))
          )}>
            <label>Categoria <select value={category} onChange={(event) => setCategory(event.target.value as ArchiveCategory)}>
              {Object.entries(outcomeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>Motivo <select key={category} name="reason" required defaultValue="">
              <option value="">Selecione</option>
              {reasons.filter((reason) => reason.category === category).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
            </select></label>
            <label>Observação interna <textarea className="block w-full rounded border border-line p-2" name="note" maxLength={2000} /></label>
            <button className={buttonClass({ variant: 'tonal', size: 'sm' })} disabled={pending}>Confirmar encerramento</button>
          </form>
        </details>
      </>}
      {status === 'HIRED' && <Badge tone="positive">Contratado</Badge>}
      {status === 'ARCHIVED' && <>
        <Badge tone="critical">{archiveReason ?? 'Participação encerrada'}</Badge>
        <form className="flex flex-wrap items-center gap-2" action={(form) =>
          submit(() => unarchiveOpportunityAction(opportunityId, String(form.get('stage') || '')))}>
          <select name="stage" aria-label="Etapa para reabertura" defaultValue="">
            <option value="">Restaurar etapa anterior</option>
            {stages.filter((stage) => stage.type !== 'HIRED').map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
          <button className={buttonClass({ variant: 'tonal', size: 'sm' })} disabled={pending}>Reabrir participação</button>
        </form>
      </>}
      {message && <p role="alert" className="text-sm">{message}</p>}
    </>
  );
}
