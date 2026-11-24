import { navigation } from '@/lib/i18n/pt-BR/navigation';
import Link from 'next/link';
import { Newspaper, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { btnPrimary, surface } from '@/components/form-controls';
import { Badge, StatusDot } from '@/components/ui/primitives';
import { LocalTime } from '@/components/local-time';
import { countAudience } from '@/server/newsletters';

export const metadata = { title: navigation.newsletters };

const SUBTITLE = "Comunicados sobre vagas abertas para candidatos";

export default async function NewslettersPage() {
  const ctx = await requireSession();
  const [newsletters, audience] = await Promise.all([
    db.newsletter.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, subject: true, status: true, recipientCount: true, sentCount: true, failedCount: true, sentAt: true, updatedAt: true },
    }),
    countAudience(ctx.orgId),
  ]);

  return (
    <div className="t-reveal">
      <PageHeader
        title="Comunicados"
        subtitle={SUBTITLE}
        actions={
          <Link href="/newsletters/new" className={btnPrimary}>
            <Plus /> Novo comunicado
          </Link>
        }
      />
      <div className="mx-6 mt-4 flex max-w-3xl flex-col gap-4 pb-8">
        <p className="text-sm text-ink-2">
          {audience.toLocaleString()} {audience === 1 ? 'candidate' : "candidatos"} podem receber o próximo comunicado. Pessoas descadastradas, com endereço inválido ou com cadastro anonimizado ficam de fora.
        </p>
        {newsletters.length ? (
          <div className={`${surface} divide-y divide-line`}>
            {newsletters.map((n) => (
              <Link
                key={n.id}
                href={`/newsletters/${n.id}`}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-[120ms] hover:bg-muted"
              >
                <span className="min-w-0 truncate text-ink">{n.subject}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-2">
                  {n.status === 'DRAFT' ? (
                    <Badge>Rascunho</Badge>
                  ) : n.status === 'SENDING' ? (
                    <>
                      <StatusDot tone="caution" /> Enviando · {n.sentCount.toLocaleString()} de {n.recipientCount.toLocaleString()}
                    </>
                  ) : (
                    <>
                      <StatusDot tone="positive" /> Enviado para {n.sentCount.toLocaleString()}
                      {n.sentAt ? (
                        <>
                          {' · '}
                          <LocalTime date={n.sentAt.toISOString()} options={{ month: 'short', day: 'numeric' }} />
                        </>
                      ) : null}
                    </>
                  )}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Newspaper}
            title="Nenhum comunicado cadastrado"
            description="Escreva uma mensagem e selecione as vagas que deseja divulgar no comunicado."
          />
        )}
      </div>
    </div>
  );
}
