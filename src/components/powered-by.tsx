import { appName } from '@/lib/i18n';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** App wordmark shared by authentication, navigation and public pages. */
export function SourceLockup({ href, className }: { href?: string; className?: string }) {
  const art = <span className="flex h-8 items-center text-lg font-bold tracking-tight text-ink">{appName}</span>;
  return href ? (
    <Link href={href} className={cn('inline-flex shrink-0', className)}>
      {art}
    </Link>
  ) : (
    <span className={cn('inline-flex shrink-0', className)}>{art}</span>
  );
}

/**
 * "Powered by" and the logo, for pages candidates and clients see: careers
 * pages, the candidate portal, offers, scheduling and share links. Opens our
 * site in a new tab so nobody loses their place.
 */
export function PoweredBySource({ className }: { className?: string }) {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener"
      className={cn('inline-flex items-center gap-2.5 text-xs text-ink-2 transition-colors hover:text-ink', className)}
    >
      Plataforma
      <SourceLockup />
    </a>
  );
}
