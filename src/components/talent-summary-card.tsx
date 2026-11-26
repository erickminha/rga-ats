'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateTalentSummary } from '@/app/(app)/contacts/resumo/actions';
import { buttonClass } from '@/components/ui/button';
import type { SummaryFacts } from '@/lib/talent-summary';

type Saved = { headline: string | null; reviewedText: string | null; reviewedAt: Date | null; sourceKind: string | null;
  status: string; stale: boolean; generatedAt: Date | null; content: unknown };

export function TalentSummaryCard({ id, saved, allowed, hasResume }: { id: string; saved: Saved | null; allowed: boolean; hasResume: boolean }) {
  const [message, setMessage] = useState('');
  const router = useRouter();
  const current = saved?.reviewedText ?? saved?.headline;
  const facts = saved?.content as (SummaryFacts & { years?: number | null }) | null;
  const status = !allowed ? 'Autorização vigente necessária' :
    saved?.status === 'QUEUED' || saved?.status === 'RUNNING' ? 'Aguardando processamento' :
    saved?.status === 'INSUFFICIENT' ? 'Informações profissionais insuficientes' :
    saved?.status === 'FAILED' ? 'Processamento indisponível' :
    saved?.stale ? 'Resumo desatualizado' : saved?.reviewedAt ? 'Revisado pela recrutadora' :
    saved?.sourceKind === 'CADASTRO' ? 'Resumo baseado no cadastro' : current ? 'Resumo disponível' : 'Resumo ainda não solicitado';
  return <section className="mb-4 rounded-card bg-surface p-4" aria-labelledby="resumo-profissional">
    <h2 id="resumo-profissional" className="font-semibold">Resumo profissional</h2>
    <p className="my-2 text-sm text-ink-2">{status}{!hasResume && ' · Currículo não disponível'}</p>
    {current && <>
      <p className="whitespace-pre-wrap break-words">{current}</p>
      <p className="my-2 text-sm text-ink-2">{saved?.sourceKind === 'CURRICULO' ? 'Fonte: currículo e cadastro' : 'Fonte: cadastro'}
        {saved?.generatedAt && ' · ' + new Date(saved.generatedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
      <dl className="mb-3 space-y-1 text-sm">{Object.entries({
        experience: 'Experiência informada', skills: 'Competências', education: 'Formação', courses: 'Cursos e certificações', interest: 'Área de interesse',
      }).map(([key, label]) => facts?.[key as keyof SummaryFacts]?.length ? <div key={key}><dt className="inline font-medium">{label} </dt>
        <dd className="inline">{facts[key as keyof SummaryFacts].join(' · ')}</dd></div> : null)}</dl>
      {typeof facts?.years === 'number' && facts.years > 0 && <p className="mb-2 text-sm">{facts.years} {facts.years === 1 ? 'ano completo' : 'anos completos'} nos períodos de trabalho datados no currículo.</p>}
      {!facts?.experience?.length && <p className="mb-2 text-sm">Experiência profissional não identificada nas fontes utilizadas.</p>}
      <button type="button" className="mb-3 underline" onClick={() => navigator.clipboard.writeText(current)
        .then(() => setMessage('Resumo copiado.')).catch(() => setMessage('Selecione o texto do resumo para copiar.'))}>Copiar resumo</button>
    </>}
    {allowed && <form className="grid gap-3" action={async form => {
      const outcome = await generateTalentSummary(id, form);
      setMessage(outcome.error ?? (form.get('intent') === 'review' ? 'Revisão salva.' : 'Solicitação registrada. Confira o andamento em Atualizar estado.'));
      router.refresh();
    }}>
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClass({ variant: 'secondary', size: 'sm' })} name="intent" value="queue">{current ? 'Atualizar resumo' : 'Gerar resumo'}</button>
        <button type="button" onClick={() => router.refresh()} className="text-sm underline">Atualizar estado</button>
      </div>
      {current && <details key={current} className="text-sm">
        <summary className="cursor-pointer">Revisar resumo</summary>
        <label className="grid gap-1">Texto revisado<textarea className="rounded-field border border-line p-2" name="summary" rows={4} maxLength={1400} defaultValue={current} /></label>
        <button className="mt-2 underline" name="intent" value="review">Salvar revisão</button>
      </details>}
    </form>}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
