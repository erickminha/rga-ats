import { notFound } from 'next/navigation';
import { PoweredBySource } from '@/components/powered-by';
import { CalendarDays } from 'lucide-react';
import { getSchedulingLink, listOpenSlots } from '@/server/scheduling';
import { SlotPicker } from '@/components/slot-picker';
import { sectionLabel, surface } from '@/components/form-controls';
import { Badge } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pick a time' };

/**
 * Public candidate self-scheduling page. Reachable only via the unguessable
 * link token; deliberately shallow — role title, interview title, duration,
 * and open times. No internal data (panel names stay off the page).
 */
export default async function SchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getSchedulingLink(token);
  if (!link) notFound();

  const alreadyBooked = link.usedAt
    ? { startAt: link.interview?.startAt.toISOString() ?? null }
    : null;
  const slots = alreadyBooked ? [] : await listOpenSlots(link);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-14">
      <p className={sectionLabel}>{link.org.name}</p>
      <h1 className="mt-2 text-2xl">{link.title}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <Badge onCanvas>
          <CalendarDays size={12} />
          <span className="tabular-nums">{link.durationMins} min</span>
        </Badge>
        {link.opportunity.posting ? <span>{link.opportunity.posting.title}</span> : null}
      </p>

      <div className="mt-8">
        {alreadyBooked ? (
          <div className={`${surface} p-8`}>
            <h2 className="text-md font-medium text-ink">Entrevista agendada</h2>
            <p className="mt-2 text-sm text-ink-2">
              {alreadyBooked.startAt
                ? `Sua entrevista está confirmada para ${new Date(alreadyBooked.startAt).toLocaleString('pt-BR', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}. Confira o convite no seu e-mail.`
                : 'This scheduling link has already been used.'}
            </p>
          </div>
        ) : slots.length === 0 ? (
          <div className={`${surface} p-8`}>
            <h2 className="text-md font-medium text-ink">Nenhum horário disponível</h2>
            <p className="mt-2 text-sm text-ink-2">
              Os horários deste link expiraram ou foram preenchidos. Entre em contato com a equipe para solicitar outro link.
            </p>
          </div>
        ) : (
          <SlotPicker token={token} slots={slots.map((s) => s.startAt.toISOString())} />
        )}
      </div>

      <div className="mt-12 flex flex-col items-start gap-2">
        <p className="text-xs text-ink-2">Os horários aparecem no seu fuso local.</p>
        <PoweredBySource />
      </div>
    </main>
  );
}
