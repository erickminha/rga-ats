import { getPortalData } from '@/server/portal';
import { PoweredBySource } from '@/components/powered-by';
import { NetworkConsentToggle } from '@/components/network-consent-toggle';
import { sectionLabel } from '@/components/form-controls';
import { Avatar } from '@/components/ui/orb';
import { Badge, type Tone } from '@/components/ui/primitives';

import { appLocale } from '@/lib/i18n';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { noIndex } from '@/lib/public-careers';

export const metadata = { title: 'Minhas candidaturas', robots: noIndex, referrer: 'no-referrer' };

const STATUS_TONES: Record<string, Tone> = {
  Hired: 'positive',
  'Not selected': 'critical',
  Closed: 'neutral',
  Interviewing: 'info',
  'Offer stage': 'caution',
  'In review': 'info',
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPortalData(token);

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-medium">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-ink-2">
          Os links de acompanhamento são válidos por 14 dias. Solicite um novo no portal onde você se candidatou.
        </p>
        <PoweredBySource className="mt-8 justify-center" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Avatar name={data.org.name} size={36} />
        <div>
          <p className="text-md font-medium text-ink">{data.org.name}</p>
          <p className="text-xs text-ink-2">Acompanhamento de {data.contact.name}</p>
        </div>
      </div>

      <section>
        <h1 className={`mb-3 ${sectionLabel}`}>Minhas candidaturas</h1>
        {data.applications.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden rounded-card bg-surface">
            {data.applications.map((app) => (
              <div key={app.id} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{app.postingTitle}</p>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {app.company} · enviada em{' '}
                    {app.appliedAt.toLocaleDateString(appLocale, {
                      timeZone: 'America/Sao_Paulo',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <Badge tone={STATUS_TONES[app.status] ?? 'neutral'}>{candidate.stages[app.status]}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-2">Nenhuma candidatura encontrada.</p>
        )}
      </section>

      {data.verifiedPreferences ? (
        <section className="mt-8">
          <h2 className={`mb-3 ${sectionLabel}`}>Minhas preferências</h2>
          <div className="grid gap-3">
            <NetworkConsentToggle token={token} optedIn={data.profileStorage} profileStorage />
            {data.networkEnabled || data.networkOptIn ? <NetworkConsentToggle token={token} optedIn={data.networkOptIn} /> : null}
          </div>
        </section>
      ) : null}

      <PoweredBySource className="mt-12" />
    </div>
  );
}
