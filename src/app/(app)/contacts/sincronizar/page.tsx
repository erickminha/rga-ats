import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, requireSession } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { TalentSyncButton } from '@/components/talent-sync-button';
import { talentSyncConfigured } from '@/server/talent-sync-run';
import { summaryConsent } from '@/server/talent-summary';

const when = (date: Date | null) => date?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) ?? '—';
const labels: Record<string, string> = { QUEUED: 'Em fila', RUNNING: 'Em execução', SUCCEEDED: 'Concluída', FAILED: 'Falhou' };

export default async function TalentSyncPage() {
  const ctx = await requireSession();
  if (!canManageRecruiting(ctx)) notFound();
  const configured = talentSyncConfigured(ctx.orgId);
  const daily = configured && process.env.RGA_TALENT_SYNC_DAILY === 'true';
  const [runs, last] = await Promise.all([
    db.talentSyncRun.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.talentSyncRun.findFirst({ where: { orgId: ctx.orgId, status: 'SUCCEEDED' }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
  ]);
  const scope = { orgId: ctx.orgId, isAnonymized: false };
  const admin = isAdmin(ctx) ? await Promise.all([
    db.contact.count({ where: { ...scope, resumeFileId: null, files: { none: { orgId: ctx.orgId, resumeVersion: true, deletePendingAt: null } } } }),
    db.contact.count({ where: { ...scope, NOT: summaryConsent(ctx.orgId) } }),
    db.talentSummary.count({ where: { orgId: ctx.orgId, contact: summaryConsent(ctx.orgId), generatedAt: { not: null } } }),
    db.talentSummary.count({ where: { orgId: ctx.orgId, contact: summaryConsent(ctx.orgId), status: { in: ['QUEUED', 'RUNNING'] } } }),
    db.talentSummary.aggregate({ where: { orgId: ctx.orgId, contact: summaryConsent(ctx.orgId) }, _sum: { tokens: true } }),
  ]) : null;
  return <main className="mx-auto grid max-w-4xl gap-4 p-4">
    <Link className="underline" href="/contacts">Voltar ao banco de talentos</Link>
    <PageHeader title="Sincronização do banco de talentos" subtitle="Atualize os cadastros pela planilha de origem e acompanhe as execuções." />
    <section className="rga-card grid gap-3 p-4">
      <p>{configured ? 'Conexão configurada no ATS.' : 'A planilha de talentos ainda precisa ser conectada a este ambiente.'}</p>
      <p>Última sincronização bem-sucedida {when(last?.finishedAt ?? null)}</p>
      <p>{daily ? 'Janela diária configurada no ATS para 03h00. Confira a próxima execução no agendador.' : 'Rotina diária desativada no ATS.'}</p>
      <TalentSyncButton enabled={configured} active={runs.some(row => row.status === 'QUEUED' || row.status === 'RUNNING')} />
    </section>
    {admin && <section className="rga-card grid gap-2 p-4">
      <h2 className="font-semibold">Processamento de resumos</h2>
      <p>{admin[2]} disponíveis · {admin[3]} pendentes · {admin[0]} sem currículo · {admin[1]} sem autorização aplicável</p>
      <p>{admin[4]._sum.tokens ?? 0} tokens nas versões atuais · até {process.env.RGA_SUMMARY_DAILY_LIMIT ?? '20'} gerações Groq por dia e {process.env.RGA_SUMMARY_MONTHLY_LIMIT ?? '400'} por mês</p>
      <p>{process.env.RGA_SUMMARY_PAUSED === 'true' ? 'Fila pausada.' : process.env.RGA_SUMMARY_AUTO === 'true' ? 'Geração automática habilitada.' : 'Somente solicitações manuais.'}</p>
    </section>}
    <section className="grid gap-3">
      <h2 className="font-semibold">Histórico</h2>
      {!runs.length && <p>Nenhuma execução registrada.</p>}
      {runs.map(run => <article key={run.id} className="rga-card grid gap-2 p-4 text-sm">
        <h3 className="font-semibold">{labels[run.status] ?? run.status} · {run.mode === 'daily' ? 'Diária' : 'Manual'} · {when(run.createdAt)}</h3>
        <p>{run.rowsRead} lidos · {run.createdCount} novos · {run.updatedCount} atualizados · {run.unchanged} sem alterações · {run.duplicates} duplicados ou ignorados</p>
        <p>{run.unresolved} sem identificação segura · {run.errors} erros de linha · {run.remaining} pendentes · {run.summaries} resumos enfileirados</p>
        {run.startedAt && run.finishedAt && <p>Duração {Math.round((+run.finishedAt - +run.startedAt) / 1000)} s</p>}
        {run.errorCode && <p>{run.status === 'FAILED' ? 'Confira a integração e solicite outra execução.' : 'A execução será retomada automaticamente.'}</p>}
      </article>)}
    </section>
  </main>;
}
