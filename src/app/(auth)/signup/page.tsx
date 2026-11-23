import { organization } from '@/lib/i18n/pt-BR/organization';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { GoogleSignIn } from '@/components/google-auth';
import { googleAuthEnabled } from '@/server/google-auth';
import { signup } from '../actions';

export const metadata = { title: 'Cadastro' };

// Per request, so the Google keys are read at runtime, not at build time.
export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  // From /agencies' Get started: the workspace is set up as a staffing agency.
  const agency = (await searchParams).kind === 'agency';
  return (
    <div>
      <h1 className="text-xl font-medium">{agency ? organization.signup.agencyTitle : 'Crie sua organização'}</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">
        {agency
          ? organization.signup.agencyDescription
          : 'Sua organização começa com um funil de recrutamento padrão. Você terá acesso de administrador principal.'}
      </p>
      {googleAuthEnabled() ? <GoogleSignIn kind={agency ? 'agency' : undefined} /> : null}
      <AuthForm
        action={signup}
        hidden={agency ? { kind: 'agency' } : undefined}
        submitLabel="Criar organização"
        fields={[
          { name: 'orgName', label: agency ? organization.signup.agencyName : organization.signup.companyName, type: 'text', placeholder: agency ? organization.signup.agencyExample : organization.signup.companyExample },
          { name: 'name', label: 'Seu nome', type: 'text', autoComplete: 'name' },
          { name: 'email', label: 'E-mail profissional', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Senha',
            type: 'password',
            placeholder: 'Pelo menos 8 caracteres',
            autoComplete: 'new-password',
          },
        ]}
      />
      <p className="mt-6 text-sm text-ink-2">
        Já tem uma conta?{' '}
        <Link href="/login" className="font-medium text-ink hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
