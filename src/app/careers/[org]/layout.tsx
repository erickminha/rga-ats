import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PoweredBySource } from '@/components/powered-by';
import { Avatar } from '@/components/ui/orb';
import { isSampleSlug } from '@/server/sample-boards';
import { brandVars, readBrand, textOn } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { BRAND_FONT_FACES } from '@/app/brand-fonts';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { careersPath } from '@/lib/public-careers';
import { careersOrganization } from '@/server/public-careers';

export default async function CareersLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: orgSlug } = await params;
  const org = await careersOrganization(orgSlug);
  if (!org) notFound();

  const saved = readBrand(org.brand);
  const isRga = /^rga\b/i.test(org.name);
  const brand = { ...saved, color: saved.color ?? (isRga ? '#1581C9' : null) };
  const face = brand.font ? BRAND_FONT_FACES[brand.font] : null;
  const onDark = !!brand.background && textOn(brand.background) !== '#0a0a0a';
  const path = careersPath(orgSlug);

  return (
    <div
      className={cn('min-h-screen bg-canvas font-sans text-ink', face?.className)}
      style={{ ...brandVars(brand, face?.cssVar), '--careers-accent': brand.color ?? 'currentColor' } as React.CSSProperties}
    >
      <header className="border-b border-line bg-surface">
        <nav aria-label="Portal de carreiras" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-8">
          <Link href={path} className="flex min-w-0 items-center gap-3 rounded-field">
            {org.logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element -- organization upload
              <img src={`/api/logo/${org.logoFileId}`} alt="" className="h-10 w-auto max-w-[100px] shrink-0 object-contain object-left" />
            ) : <Avatar name={org.name} size={36} />}
            <span className="min-w-0 break-words text-sm font-semibold">{org.name}</span>
          </Link>
          {!isSampleSlug(orgSlug) ? <Link href={path + '/status'} className="rounded-field py-2 text-sm font-medium underline-offset-4 hover:underline">
            {candidate.track}
          </Link> : null}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">{children}</main>
      <footer className={cn('mx-auto max-w-6xl px-4 pb-8 sm:px-8', onDark && 'dark')}>
        <PoweredBySource />
      </footer>
    </div>
  );
}
