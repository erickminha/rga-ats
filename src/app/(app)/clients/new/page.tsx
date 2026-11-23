import { notFound } from 'next/navigation';
import { isAdmin, requireSession } from '@/lib/session';
import { canViewClientCompanies } from '@/server/client-companies';
import { ClientCompanyForm } from '@/components/client-company-form';

export const metadata = { title: 'Cadastrar empresa' };

export default async function NewClientPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx) || !await canViewClientCompanies(ctx)) notFound();
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-6 py-6">
      <h1 className="text-xl font-medium">Cadastrar empresa</h1>
      <ClientCompanyForm />
    </div>
  );
}
