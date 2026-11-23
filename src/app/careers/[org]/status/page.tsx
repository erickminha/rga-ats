import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { StatusRequestForm } from '@/components/status-request-form';

import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { noIndex } from '@/lib/public-careers';
import { isSampleSlug } from '@/server/sample-boards';
import { notFound } from 'next/navigation';

export const metadata = { title: candidate.track, robots: noIndex };

export default async function StatusRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { org: orgSlug } = await params;
  if (isSampleSlug(orgSlug)) notFound();
  const { sent } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Link
        href={`/careers/${orgSlug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors duration-[120ms] hover:text-ink"
      >
        <ArrowLeft size={14} /> Todas as vagas
      </Link>

      <div className="rounded-card border border-line bg-surface p-5 sm:p-8">
        {sent ? (
          <div className="flex flex-col items-center py-4 text-center">
            <MailCheck size={26} className="text-positive" />
            <h1 className="mt-4 text-xl font-medium">{candidate.statusSent}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {candidate.statusSentDetail}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-medium">{candidate.track}</h1>
            <p className="mb-6 mt-1 text-sm text-ink-2">
              {candidate.statusIntro}
            </p>
            <StatusRequestForm orgSlug={orgSlug} />
          </>
        )}
      </div>
    </div>
  );
}
