import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin, requireSession } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { RgaSpreadsheetImport } from '@/components/imports/rga-spreadsheet-import';

export const metadata = { title: 'Importar planilhas RGA' };

export default async function SpreadsheetImportPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) redirect('/settings');
  return (
    <div>
      <div className="px-6 pt-6"><Link href="/settings/import" className="text-sm underline">Voltar para importações</Link></div>
      <PageHeader title="Importar planilhas RGA" subtitle="Gestão de Trabalho e Banco de Talentos" />
      <div className="mx-6 my-5 max-w-4xl pb-8"><RgaSpreadsheetImport /></div>
    </div>
  );
}
