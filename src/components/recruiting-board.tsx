'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MapPin, Mail, Phone } from 'lucide-react';
import type { StageType } from '@prisma/client';
import { moveStageAction } from '@/app/(app)/actions';
import { CandidateLink } from '@/components/candidate-link';
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
      {stages.map((stage, index) => <section className="rga-stage w-72 shrink-0 rounded-card border p-3" key={stage.id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); if (!pending) move(event.dataTransfer.getData('text/plain'), stage); }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 shrink-0 rounded-full" style={{ background: stage.type === 'HIRED' ? '#267347' : ['#1581c9', '#6c336e', '#c28b1a'][index % 3] }} /><span className="flex-1">{stage.name}</span><span className="rounded-full bg-surface px-2 py-1 text-xs tabular-nums">{stage.rows.length}{stage.hasMore ? '+' : ''}</span></h2>
        <div className="grid gap-2">
          {stage.rows.length === 0 && <p className="text-sm text-ink-2">Nenhuma participação</p>}
          {stage.rows.map((row) => <div key={row.id} className="rga-stage-card rounded-xl p-3"
            draggable={stage.type !== 'HIRED'} onDragStart={(event) => event.dataTransfer.setData('text/plain', row.id)}>
            <CandidateLink id={row.id} lazy className="block break-words text-sm font-bold hover:text-brand hover:underline">{row.name}</CandidateLink>
            <p className="mb-2 break-words text-xs text-ink-2">{row.headline || "Cargo de interesse não informado"}</p>
            {(row.postingTitle || row.clientName) && <p className="mb-2 break-words text-xs font-medium text-ink">{[row.postingTitle, row.clientName].filter(Boolean).join(' · ')}</p>}
            {row.location && <p className="mb-2 flex items-start gap-1 text-xs text-ink-2"><MapPin size={13} className="shrink-0" />{row.location}</p>}
            {(row.phone || row.email) && <div className="mb-3 flex flex-wrap gap-2 text-xs text-ink-2">
              {row.phone && <a className="inline-flex items-center gap-1 rounded-field border border-line px-2 py-1 hover:text-brand" href={`tel:${row.phone.replace(/[^+\\d]/g, '')}`}><Phone size={13} />{row.phone}</a>}
              {row.email && <a className="inline-flex items-center gap-1 rounded-field border border-line px-2 py-1 hover:text-brand" href={`mailto:${row.email}`} aria-label={`Enviar e-mail para ${row.name}`}><Mail size={13} /> E-mail</a>}
            </div>}
            {stage.type !== 'HIRED' && <StageSelect opportunityId={row.id} currentStageId={stage.id} stages={stages} onSurface />}
          </div>)}
        </div>
        {stage.hasMore && <Link className="mt-3 inline-block text-sm underline" href={`/pipeline?${query}&stage=${encodeURIComponent(stage.id)}`}>Ver todos nesta etapa</Link>}
      </section>)}
    </div>
  </section>;
}
