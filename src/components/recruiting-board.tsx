'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { StageType } from '@prisma/client';
import { moveStageAction } from '@/app/(app)/actions';
import { StageSelect } from '@/components/stage-select';
import type { PipelineRow } from '@/lib/list-types';
import { confirmStageMovement } from '@/lib/stage-movement';

type BoardStage = { id: string; name: string; type: StageType; rows: PipelineRow[]; hasMore: boolean };

export function RecruitingBoard({ stages, query }: { stages: BoardStage[]; query: string }) {
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function move(id: string, target: BoardStage) {
    const before = stages.findIndex((column) => column.rows.some((row) => row.id === id));
    const after = stages.findIndex((column) => column.id === target.id);
    if (before < 0 || before === after) return;
    const input = confirmStageMovement(target.type, after - before !== 1);
    if (!input) return;
    start(async () => {
      setError('');
      try { await moveStageAction(id, target.id, input); }
      catch { setError('Não foi possível mover a participação. Confira a etapa e a data informada.'); }
    });
  }
  return <section className="min-w-0 px-4 pb-8 md:px-6" aria-label="Quadro do funil">
    {error && <p role="alert">{error}</p>}
    <div className="flex gap-3 overflow-x-auto pb-4" aria-busy={pending}>
      {stages.map((stage) => <section className="w-64 shrink-0 rounded-card border border-line p-3" key={stage.id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); if (!pending) move(event.dataTransfer.getData('text/plain'), stage); }}>
        <h2 className="mb-3 text-sm font-semibold">{stage.name}</h2>
        <div className="grid gap-2">
          {stage.rows.length === 0 && <p className="text-sm text-ink-2">Nenhuma participação</p>}
          {stage.rows.map((row) => <div key={row.id} className="rounded-field bg-surface p-3"
            draggable={stage.type !== 'HIRED'} onDragStart={(event) => event.dataTransfer.setData('text/plain', row.id)}>
            <Link className="font-medium underline" href={`/candidates/${row.id}`}>{row.name}</Link>
            <p className="mt-1 break-words text-sm text-ink-2">{row.headline ?? 'Cargo pretendido não informado'}</p>
            {row.postingTitle && <p className="mt-1 text-xs">Vaga: {row.postingTitle}{row.clientName ? ` · ${row.clientName}` : ''}</p>}
            {row.location && <p className="mt-1 text-xs text-ink-2">{row.location}</p>}
            {row.phone && <p className="mt-1 text-xs text-ink-2">Tel.: {row.phone}</p>}
            <p className="mb-2 mt-1 text-xs text-ink-2">{row.days === 0 ? 'Hoje nesta etapa' : `${row.days} dia(s) nesta etapa`}</p>
            {stage.type !== 'HIRED' && <StageSelect opportunityId={row.id} currentStageId={stage.id} stages={stages} onSurface />}
          </div>)}
        </div>
        {stage.hasMore && <Link className="mt-3 inline-block text-sm underline" href={`/pipeline?${query}&stage=${encodeURIComponent(stage.id)}`}>Ver todos nesta etapa</Link>}
      </section>)}
    </div>
  </section>;
}
