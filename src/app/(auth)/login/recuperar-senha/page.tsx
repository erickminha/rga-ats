import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { requestRecovery } from '../../password-actions';

export const metadata = { title: 'Recuperar senha', robots: { index: false, follow: false } };

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ solicitado?: string }> }) {
  const { solicitado } = await searchParams;

  return (
    <div>
      <h1 className="text-xl font-medium">{solicitado === '1' ? 'Confira sua caixa de entrada' : 'Recuperar senha'}</h1>
      {solicitado === '1' ? (
        <p role="status" className="mt-2 text-sm text-ink-2">
          Se houver uma conta com senha para esse endereço, você poderá receber um link de recuperação por e-mail.
          Se usa o Google para entrar, continue com o Google na tela de login.
        </p>
      ) : (
        <>
          <p className="mb-6 mt-1 text-sm text-ink-2">Informe o e-mail que você usa para entrar no RGA ATS.</p>
          <AuthForm action={requestRecovery} submitLabel="Solicitar recuperação"
            fields={[{ name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' }]} />
        </>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm font-medium underline">Voltar para o login</Link>
    </div>
  );
}
