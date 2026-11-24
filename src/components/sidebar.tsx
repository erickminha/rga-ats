'use client';

import { navigation } from '@/lib/i18n/pt-BR/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SourceLockup } from '@/components/powered-by';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Inbox,
  Kanban,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Search,
  Settings,
  Home,
  UserPlus,
  Users,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/orb';
import { AskBox } from '@/components/ask-box';

/** Items the mobile floating nav shows directly; the rest live under More. */
const MOBILE_PRIMARY = ['/dashboard', '/pipeline', '/postings', '/interviews'];

// Institutional blue from the RGA palette, used on the selection outline.
const activeAccent = 'ring-1 ring-inset ring-[#1581c9]';

const nav = [
  { href: '/dashboard', label: navigation.dashboard, icon: Home },
  { href: '/search', label: navigation.search, icon: Search },
  { href: '/review', label: navigation.review, icon: Inbox },
  { href: '/pipeline', label: navigation.pipeline, icon: Kanban },
  { href: '/contacts', label: navigation.contacts, icon: Users },
  { href: '/referrals', label: navigation.referrals, icon: UserPlus },
  { href: '/postings', label: navigation.postings, icon: Briefcase },
  { href: '/interviews', label: navigation.interviews, icon: CalendarDays },
  { href: '/tasks', label: navigation.tasks, icon: ListTodo },
  { href: '/reports', label: navigation.reports, icon: BarChart3 },
  { href: '/settings', label: navigation.settings, icon: Settings },
];

export function Sidebar({
  user,
  org,
  signOutAction,
  aiEnabled = false,
}: {
  user: { name: string; email: string };
  org: { name: string; logoFileId: string | null };
  signOutAction: () => Promise<void>;
  /** Whether the ask box answers questions (AI on) or only searches. */
  aiEnabled?: boolean;
}) {
  const pathname = usePathname();
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
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ y: number; h: number } | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const isActive = (href: string) => pathname.startsWith(href);
  const go = (href: string) => {
    if (!pathname.startsWith(href)) setPendingHref(href);
  };
  // The active pill slides to where you're going (transitions.dev "tabs sliding",
  // vertical). It moves on click, before the route resolves, so nav feels instant.
  const pendingLabel = nav.find(({ href }) => href === pendingHref)?.label;
  const target = pendingHref ?? nav.find((n) => isActive(n.href))?.href ?? null;
  useLayoutEffect(() => {
    const el = target ? linkRefs.current.get(target) : undefined;
    setPill(el ? { y: el.offsetTop, h: el.offsetHeight } : null);
  }, [target]);

  const primary = nav.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const overflow = nav.filter((n) => !MOBILE_PRIMARY.includes(n.href));

  return (
    <>
      {/* Desktop: canvas-colored rail, no border — pills carry the state */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col md:flex">
        {/* The logo: the lockup (public/brand) at 32px, its minimum */}
        <div className="px-5 pb-4 pt-6">
          <SourceLockup />
        </div>

        {/* Workspace — the customer's logo and name on a raised surface */}
        <div className="mx-3 mb-5 flex items-center gap-3 rounded-card bg-surface p-2.5">
          {org.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- org-uploaded logo via internal route
            <img
              src={`/api/logo/${org.logoFileId}`}
              alt=""
              aria-hidden
              className="size-8 shrink-0 rounded-full object-contain"
            />
          ) : (
            <Avatar name={org.name || navigation.workspace} size={32} />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">{org.name}</span>
            <span className="text-xs text-ink-2">{navigation.workspace}</span>
          </span>
        </div>

        <nav aria-label={navigation.main} className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {pill ? (
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 top-0 rounded-full bg-surface transition-[transform,height] duration-[var(--duration-fast)] ease-[var(--ease-smooth)]',
                activeAccent,
              )}
              style={{ height: pill.h, transform: `translateY(${pill.y}px)` }}
            />
          ) : null}
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            const pending = pendingHref === href;
            return (
              <Link
                key={href}
                ref={(el) => {
                  if (el) linkRefs.current.set(href, el);
                  else linkRefs.current.delete(href);
                }}
                href={href}
                onClick={(e) => openAsk(href, e)}
                onNavigate={() => go(href)}
                title={href === '/search' ? navigation.searchShortcut : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 shrink-0 items-center gap-3 rounded-full px-3.5 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth)]',
                  active || pending
                    ? 'font-medium text-ink'
                    : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
                  active && !pill && ['bg-surface', activeAccent],
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={cn('shrink-0', pending && 'animate-pulse')}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div role="group" aria-label={navigation.account} className="m-3 flex items-center gap-3 rounded-card p-2">
          <Avatar name={user.name || user.email} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-2">{user.email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              title={navigation.signOut}
              aria-label={navigation.signOut}
              className="flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors duration-[120ms] hover:bg-ink/[0.05] hover:text-ink"
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile: floating white pill nav — icon over an 11px label */}
      <nav aria-label={navigation.main} className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 md:hidden">
        <div className="grid w-full max-w-sm grid-cols-[1fr_1.45fr_1fr_1fr_1fr] items-center gap-0.5 rounded-full bg-surface p-1.5 shadow-float">
          {primary.map(({ href, label, icon: Icon }) => {
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
                <Icon size={18} strokeWidth={1.75} className={cn(pendingHref === href && 'animate-pulse')} />
                {label}
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
              <MoreHorizontal size={18} strokeWidth={1.75} />
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
                      <Icon size={16} strokeWidth={1.75} className="text-ink-2" />
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
