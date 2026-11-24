import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { hasRecruitingRole } from '@/lib/recruiting-role';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { getAuthSession, getOrgNav, requireSession } from '@/lib/session';
import { readOrgNavCookie } from '@/lib/org-nav-cookie';
import { SourceCodeLinks } from '@/components/powered-by';
import { Sidebar } from '@/components/sidebar';
import { Toaster } from '@/components/toaster';
import { PersistOrgNav } from '@/components/persist-org-nav';
import { DrawerHost } from '@/components/drawer-host';
import { canViewClientCompanies } from '@/server/client-companies';
import { aiConfigured } from '@/server/ai-client';

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.orgId) redirect('/login');

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  if (!hasRecruitingRole(session.user.accessRole)) {
    return (
      <main>
        <header className="flex items-center justify-between gap-3 px-6 py-4">
          <a href="/interviews" className="font-medium">Minhas entrevistas</a>
          <form action={handleSignOut}><button className="text-sm underline" type="submit">Sair</button></form>
        </header>
        {children}
        <footer className="px-6 pb-6 pt-4"><SourceCodeLinks /></footer>
      </main>
    );
  }

  const fromJwt =
    session.user.orgName != null
      ? {
          name: session.user.orgName,
          logoFileId: session.user.orgLogoFileId ?? null,
          onboardedAt: session.user.onboardedAt ? new Date(session.user.onboardedAt) : null,
        }
      : null;
  const fromCookie = fromJwt ? null : await readOrgNavCookie();
  let fetched = fromJwt || fromCookie ? null : await getOrgNav(session.user.orgId);
  // The token and the cookie are written at sign-in: "not onboarded" there
  // may be out of date (setup finished since, and the onboarding page, which
  // reads the database, would send you straight back here). Ask the org row,
  // which "Finish setup" revalidates, before sending anyone to onboarding.
  if (!(fromJwt ?? fromCookie ?? fetched)?.onboardedAt) fetched ??= await getOrgNav(session.user.orgId);
  const org = fetched ?? fromJwt ?? fromCookie;
  if (org && !org.onboardedAt) redirect('/onboarding');

  const showClients = await canViewClientCompanies(await requireSession());

  return (
    // DrawerHost holds the candidate drawer for every page, so it can open on
    // the click and slide out on any exit (see drawer-host.tsx).
    <DrawerHost>
    <div className="rga-workspace flex min-h-screen">
      <Sidebar
        user={{ name: session.user.name ?? '', email: session.user.email ?? '' }}
        org={{ name: org?.name ?? navigation.workspace, logoFileId: org?.logoFileId ?? null }}
        signOutAction={handleSignOut}
        aiEnabled={aiConfigured()}
        showClients={showClients}
      />
      {fetched ? (
        <PersistOrgNav
          name={fetched.name}
          logoFileId={fetched.logoFileId}
          onboardedAt={fetched.onboardedAt ? fetched.onboardedAt.toISOString() : null}
        />
      ) : null}
      <main id="rga-main" className="min-w-0 flex-1 pb-28 max-md:overflow-x-auto md:pb-0">
        {children}
        <footer className="px-6 pb-6 pt-4"><SourceCodeLinks /></footer>
      </main>
      <Toaster />
      {modal}
    </div>
    </DrawerHost>
  );
}
