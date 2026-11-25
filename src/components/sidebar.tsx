'use client';

import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { RgaDashboard, RgaJobs, RgaPipeline, RgaTalents, RgaClients, RgaInterviews, RgaTasks, RgaReports, RgaReview, RgaReferrals, RgaSettings, RgaSearch, RgaMore, RgaDisc } from '@/components/ui/rga-icons';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/orb';
import { AskBox } from '@/components/ask-box';

/** Items the mobile floating nav shows directly; the rest live under More. */
const MOBILE_PRIMARY = ['/dashboard', '/postings', '/pipeline', '/contacts'];

// Institutional blue from the RGA palette, used on the selection outline.
const activeAccent = 'ring-1 ring-inset ring-[#1581c9]';

const menu = [
  { href: '/dashboard', label: 'Visão geral', short: 'Painel', icon: RgaDashboard, group: 'OPERAÇÃO' },
  { href: '/postings', label: 'Vagas', short: 'Vagas', icon: RgaJobs, group: 'OPERAÇÃO' },
  { href: '/pipeline', label: 'Funil de recrutamento', short: 'Funil', icon: RgaPipeline, group: 'OPERAÇÃO' },
  { href: '/contacts', label: 'Banco de talentos', short: 'Talentos', icon: RgaTalents, group: 'OPERAÇÃO' },
  { href: '/clients', label: 'Empresas clientes', short: 'Empresas', icon: RgaClients, group: 'OPERAÇÃO' },
  { href: '/interviews', label: 'Entrevistas', short: 'Agenda', icon: RgaInterviews, group: 'ACOMPANHAMENTO' },
  { href: '/disc', label: 'Central DISC', short: 'DISC', icon: RgaDisc, group: 'ACOMPANHAMENTO' },
  { href: '/tasks', label: 'Tarefas', short: 'Tarefas', icon: RgaTasks, group: 'ACOMPANHAMENTO' },
  { href: '/reports', label: 'Relatórios', short: 'Relatórios', icon: RgaReports, group: 'ACOMPANHAMENTO' },
  { href: '/review', label: 'Revisão de candidaturas', short: 'Revisão', icon: RgaReview, group: 'FERRAMENTAS' },
  { href: '/referrals', label: 'Indicações', short: 'Indicações', icon: RgaReferrals, group: 'FERRAMENTAS' },
  { href: '/settings', label: 'Configurações', short: 'Config.', icon: RgaSettings, group: 'FERRAMENTAS' },
];

export function Sidebar({
  user,
  org,
  signOutAction,
  aiEnabled = false,
  showClients = false,
}: {
  user: { name: string; email: string };
  org: { name: string; logoFileId: string | null };
  signOutAction: () => Promise<void>;
  /** Whether the ask box answers questions (AI on) or only searches. */
  aiEnabled?: boolean;
  showClients?: boolean;
}) {
  const pathname = usePathname();
  const nav = menu.filter((item) => item.href !== '/clients' || showClients);
  const [askOpen, setAskOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const searchFromMore = useRef(false);
  // ⌘K / Ctrl+K opens the ask box from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setAskOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /** Search opens the ask box on a plain click; a modified click still opens /search. */
  const openAsk = (href: string, e: React.MouseEvent, fromMore = false) => {
    if (href !== '/search' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    e.preventDefault();
    if (fromMore) {
      searchFromMore.current = true;
      setMoreOpen(false);
    } else {
      setAskOpen(true);
    }
    return true;
  };
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const mobileSignOut = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const go = (href: string) => {
    if (!isActive(href)) setPendingHref(href);
  };
  // The active pill slides to where you're going (transitions.dev "tabs sliding",
  // vertical). It moves on click, before the route resolves, so nav feels instant.
  const pendingLabel = nav.find(({ href }) => href === pendingHref)?.label;

  const primary = nav.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const overflow = nav.filter((n) => !MOBILE_PRIMARY.includes(n.href));

  return (
    <>
      <aside className="rga-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col md:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-5 pb-5 pt-6">
          {org.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- organization logo
            <img src={`/api/logo/${org.logoFileId}`} alt="" className="size-11 rounded-xl bg-white object-contain p-1" />
          ) : (
            <span className="rga-display grid size-11 place-items-center rounded-xl bg-[#1581c9] text-sm font-bold text-white">RGA</span>
          )}
          <span className="min-w-0">
            <span className="rga-display block text-lg font-semibold leading-6 text-white">RGA ATS</span>
            <span className="block text-[10px] tracking-[.12em] text-[#b7c8dc]">RECURSOS HUMANOS</span>
          </span>
        </Link>
        <div className="mx-3 mb-3 rounded-xl border border-[#35445a] bg-[#202c3b] px-3 py-2.5">
          <p className="truncate text-sm font-bold text-white">{org.name}</p>
          <p className="text-xs text-[#b7c8dc]">Espaço de trabalho</p>
        </div>
        <button type="button" onClick={() => setAskOpen(true)} className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-[#35445a] px-3 py-2.5 text-left text-sm text-[#dce8f5] hover:bg-[#27384b]">
          <RgaSearch size={20} /> <span className="flex-1">Busca global</span><kbd className="text-[10px] text-[#b7c8dc]">Ctrl K</kbd>
        </button>
        <nav aria-label={navigation.main} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
          {['OPERAÇÃO', 'ACOMPANHAMENTO', 'FERRAMENTAS'].map((group) => (
            <div key={group} className="grid gap-1">
              <p className="px-3 pb-1 text-[10px] font-bold tracking-[.12em] text-[#a6b8ce]">{group}</p>
              {nav.filter((item) => item.group === group).map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onNavigate={() => go(href)} aria-current={isActive(href) ? 'page' : undefined}
                  data-pending={pendingHref === href || undefined}
                  className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#dae5f2] transition-colors hover:bg-[#27384b]">
                  <Icon size={22} strokeWidth={1.65} className="shrink-0" />{label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div role="group" aria-label={navigation.account} className="m-3 flex items-center gap-3 rounded-xl border border-[#35445a] bg-[#202c3b] p-2.5">
          <Avatar name={user.name || user.email} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{user.name || 'Minha conta'}</p>
            <p className="truncate text-xs text-[#b7c8dc]">{user.email}</p>
          </div>
          <form action={signOutAction}>
            <button type="submit" title={navigation.signOut} aria-label={navigation.signOut} className="flex size-9 items-center justify-center rounded-lg text-[#dce8f5] hover:bg-[#35445a]">
              <LogOut size={17} />
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile: floating white pill nav — icon over an 11px label */}
      <nav aria-label={navigation.main} className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 md:hidden">
        <div className="grid w-full max-w-sm grid-cols-5 items-center gap-0.5 rounded-2xl border border-line bg-surface p-1.5 shadow-float">
          {primary.map(({ href, short, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => openAsk(href, e)}
                onNavigate={() => go(href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-center text-2xs leading-tight transition-colors duration-[120ms]',
                  active ? ['bg-muted text-ink', activeAccent] : 'text-ink-2',
                )}
              >
                <Icon size={22} strokeWidth={1.65} className={cn(pendingHref === href && 'animate-pulse')} />
                {short}
              </Link>
            );
          })}
          <DropdownMenu.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownMenu.Trigger
              ref={moreTrigger}
              aria-label={navigation.moreOptions}
              className={cn(
                'flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-center text-2xs leading-tight outline-none transition-colors duration-[120ms] data-[state=open]:bg-muted',
                overflow.some((n) => isActive(n.href)) ? ['bg-muted text-ink', activeAccent] : 'text-ink-2',
              )}
            >
              <RgaMore size={22} strokeWidth={1.75} />
              {navigation.more}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="end"
                sideOffset={10}
                onCloseAutoFocus={(event) => {
                  if (!searchFromMore.current) return;
                  event.preventDefault();
                  // Let the menu close before the dialog takes focus.
                  moreTrigger.current?.focus();
                  setAskOpen(true);
                }}
                className="menu-animate z-[350] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[200px] overflow-y-auto rounded-card bg-surface p-1 shadow-float"
              >
                <DropdownMenu.Item onSelect={() => { searchFromMore.current = true; }} className="flex items-center gap-3 rounded-field px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted"><RgaSearch size={20} /> Busca global</DropdownMenu.Item>
                {overflow.map(({ href, label, icon: Icon }) => (
                  <DropdownMenu.Item key={href} asChild>
                    <Link
                      href={href}
                      aria-current={isActive(href) ? 'page' : undefined}
                      title={href === '/search' ? navigation.searchShortcut : undefined}
                      onClick={(e) => openAsk(href, e, true)}
                      onNavigate={() => go(href)}
                      className={cn(
                        'flex items-center gap-3 rounded-field px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted',
                        isActive(href) ? 'bg-muted text-ink' : 'text-ink',
                      )}
                    >
                      <Icon size={20} strokeWidth={1.65} className="text-ink-2" />
                      {label}
                    </Link>
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  onSelect={() => mobileSignOut.current?.requestSubmit()}
                  className="flex items-center gap-3 rounded-field px-3 py-2 text-sm text-ink-2 outline-none data-[highlighted]:bg-muted"
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  {navigation.signOut}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <form ref={mobileSignOut} action={signOutAction} hidden />
      </nav>
      <span role="status" className="sr-only">
        {pendingLabel ? navigation.loadingPage(pendingLabel) : null}
      </span>
      <AskBox
        open={askOpen}
        onOpenChange={setAskOpen}
        aiEnabled={aiEnabled}
        onCloseAutoFocus={(event) => {
          if (!searchFromMore.current) return;
          searchFromMore.current = false;
          event.preventDefault();
          moreTrigger.current?.focus();
        }}
      />
    </>
  );
}
