import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession, isAdmin } from '@/lib/session';
import { db } from '@/lib/db';
import { discAiConfiguration } from '@/server/disc-ai-settings';
import { assistantStatus } from '@/server/assistant-provider';
import { AssistantStatusCard } from '@/components/assistant-status-card';
import { DiscAiSettingsForm } from '@/components/disc-ai-settings-form';
import { PageHeader } from '@/components/page-header';

export default async function DiscAiSettingsPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) notFound();
  const [config, history] = await Promise.all([
    discAiConfiguration(ctx.orgId),
    db.event.findMany({ where: { orgId: ctx.orgId, verb: { in: ['disc.interpreted', 'disc.ai_tested', 'disc.ai_attempt'] } }, orderBy: { occurredAt: 'desc' }, take: 50,
      select: { id: true, verb: true, occurredAt: true, payload: true } }),
  ]);
  return <main className="grid max-w-4xl gap-4 p-5">
    <Link className="underline" href="/disc">Voltar à Central DISC</Link>
    <PageHeader title="Inteligência artificial" subtitle="Assistente geral e interpretação DISC: configurações independentes." />
    <AssistantStatusCard config={assistantStatus()} />
    <h2 className="font-semibold">Interpretação DISC</h2>
    <DiscAiSettingsForm config={config} />
    <section className="rga-card grid gap-2 p-4">
      <h2 className="font-semibold">Últimas interpretações e testes</h2>
      {!history.length && <p>Nenhuma execução registrada.</p>}
      {history.map(event => {
        const payload = event.payload as Record<string, unknown> | null;
        return <p key={event.id} className="border-t border-line py-2 text-sm">{event.occurredAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {event.verb === 'disc.ai_tested' ? 'Teste' : event.verb === 'disc.ai_attempt' ? 'Chamada ao provedor' : 'Interpretação'} · {String(payload?.provider ?? 'local')} · {String(payload?.model ?? '')} · {typeof payload?.tokens === 'number' ? payload.tokens + ' tokens' : 'Consumo não informado'}{payload?.cached === true ? ' · Cache' : ''}{typeof payload?.success === 'boolean' ? payload.success ? ' · Sucesso' : ' · Falha' : ''}</p>;
      })}
    </section>
  </main>;
}
