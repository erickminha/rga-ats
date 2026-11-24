import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdmin, requireSession } from '@/lib/session';
import { getImportJob } from '@/server/imports/jobs';
import { db } from '@/lib/db';
import { RGA_IMPORT_PROVIDER } from '@/lib/rga-import';
import { rgaReport } from '@/server/imports/rga-spreadsheet';
import { RgaImportReport } from '@/components/imports/rga-import-report';
import { ImportJob } from '@/components/imports/import-job';

/** One import's progress, stage review, and outcome. The client component keeps it moving. */
export const metadata = { title: 'Import' };

export default async function ImportJobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) redirect('/settings');

  const { id } = await params;
  const spreadsheet = await db.importJob.findFirst({
    where: { id, orgId: ctx.orgId, provider: RGA_IMPORT_PROVIDER },
    select: { accountName: true, stats: true },
  });
  if (spreadsheet) {
    const report = rgaReport(spreadsheet.stats);
    if (!report) notFound();
    return (
      <section className="mx-auto grid max-w-4xl gap-5 px-6 py-8">
        <Link href="/settings/import" className="justify-self-start text-sm underline">Voltar para importações</Link>
        <h1 className="text-xl font-medium">Relatório de importação</h1>
        <p className="text-sm text-ink-2">{spreadsheet.accountName}</p>
        <RgaImportReport report={report} />
      </section>
    );
  }
  const job = await getImportJob(ctx, id);
  if (!job) notFound();

  return (
    <div>
      <div className="px-6 pt-6">
        <Link
          href="/settings/import"
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors duration-[120ms] hover:text-ink"
        >
          <ArrowLeft size={14} /> Imports
        </Link>
      </div>
      <ImportJob key={job.id} initial={job} />
    </div>
  );
}
