import { organization } from '@/lib/i18n/pt-BR/organization';
import { settings } from '@/lib/i18n/pt-BR/settings';
import { redirect } from 'next/navigation';
import { SourceCodeLinks, SourceLockup } from '@/components/powered-by';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { completeOnboardingAction } from '@/app/org-actions';
import { OrgKindPicker } from '@/components/org-kind-picker';
import { GroupManager } from '@/components/group-manager';
import { OnboardingPipeline } from '@/components/onboarding-pipeline';
import { btnGhost, surface } from '@/components/form-controls';
import { signOut } from '@/lib/auth';

export const metadata = { title: 'Configuração inicial' };

async function signOutAction() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function OnboardingPage() {
  const ctx = await requireSession();
  const org = await db.organization.findUnique({
    where: { id: ctx.orgId },
    include: {
      departments: { orderBy: { name: 'asc' } },
      clientCompanies: { orderBy: { name: 'asc' } },
      stages: { orderBy: { order: 'asc' } },
    },
  });
  if (!org) redirect('/login');
  if (org.onboardedAt) redirect('/pipeline');

  const isAgency = org.kind === 'AGENCY';

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <SourceLockup />
        {/* A way out: skip to the app with the defaults (all of it is in Settings later), or leave. */}
        <div className="flex items-center gap-1">
          <form action={completeOnboardingAction}>
            <button type="submit" className={btnGhost}>
              Pular por enquanto
            </button>
          </form>
          <form action={signOutAction}>
            <button type="submit" className={btnGhost}>
              Sair
            </button>
          </form>
        </div>
      </div>

      <h1 className="text-xl font-medium">Configure {org.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        Personalize seu espaço de trabalho. Você pode alterar essas opções nas configurações.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <section className={`${surface} p-5`}>
          <h2 className="mb-1 text-md font-medium">1 · Para quem você recruta?</h2>
          <p className="mb-4 text-sm text-ink-2">
            Essa escolha define como as vagas são organizadas no aplicativo.
          </p>
          <OrgKindPicker current={org.kind} />
        </section>

        <section className={`${surface} p-5`}>
          <h2 className="mb-1 text-md font-medium">
            2 · {isAgency ? organization.client.plural : organization.department.plural}
          </h2>
          <p className="mb-4 text-sm text-ink-2">
            {isAgency
              ? settings.business.clientsDescription
              : settings.business.departmentsDescription}
          </p>
          <GroupManager
            kind={isAgency ? 'client' : 'department'}
            items={(isAgency ? org.clientCompanies : org.departments).map((g) => ({
              id: g.id,
              name: g.name,
            }))}
            placeholder={isAgency ? organization.client.example : organization.department.example}
          />
        </section>

        <OnboardingPipeline stages={org.stages.map((s) => ({ id: s.id, name: s.name, type: s.type }))} />
      </div>
      <SourceCodeLinks className="mt-4" />
    </div>
  );
}
