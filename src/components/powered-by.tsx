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

const repository = 'https://github.com/erickminha/rga-ats';
const revision = process.env.RGA_ATS_SOURCE_REVISION || 'homolog';
const linkClass = 'underline underline-offset-2 hover:text-ink focus-visible:is-focused';

export function SourceCodeLinks({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2', className)}>
      <a href={`${repository}/tree/${revision}`} className={linkClass}>
        Código-fonte do RGA ATS
      </a>
      <a href={`${repository}/blob/${revision}/LICENSE`} className={linkClass}>
        Licença GNU AGPLv3
      </a>
    </div>
  );
}

/** The product wordmark and source notices on pages for candidates and clients. */
export function PoweredBySource({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      <a
        href="/"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2.5 text-xs text-ink-2 transition-colors hover:text-ink"
      >
        Plataforma
        <SourceLockup />
      </a>
      <SourceCodeLinks />
    </div>
  );
}
