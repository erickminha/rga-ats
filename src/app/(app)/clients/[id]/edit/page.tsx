import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { canViewClientCompanies, getClientCompany } from '@/server/client-companies';
import { ClientCompanyForm } from '@/components/client-company-form';

export const metadata = { title: 'Editar empresa' };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  if (!await canViewClientCompanies(ctx)) notFound();
  const { id } = await params;
  const client = await getClientCompany(ctx, id);
  if (!client) notFound();
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-6 py-6">
      <h1 className="text-xl font-medium">Editar empresa</h1>
      <ClientCompanyForm company={client} />
    </div>
  );
}
