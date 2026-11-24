import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { AuthForm } from '@/components/auth-form';
import { GoogleSignIn } from '@/components/google-auth';
import { signInErrorMessage } from '@/lib/auth-errors';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { demoEnabled } from '@/server/demo';
import { googleAuthEnabled } from '@/server/google-auth';
import { requestOrigin } from '@/server/request-origin';
import { demoLogin, login } from '../actions';

export const metadata = { title: 'Entrar' };

// Rendered per-request so the DEMO_MODE flag and the Google keys are read
// at runtime, not baked in at build time.
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[]; senha?: string | string[] }>;
}) {
  const params = await searchParams;
  const google = googleAuthEnabled();
  const error = signInErrorMessage(first(params.error), { google });
  // The middleware sends people here with the page they wanted; keep it,
  // as a path on this site, for after they sign in.
  const { origin } = await requestOrigin();
  const callbackUrl = safeRedirectPath(first(params.callbackUrl), { origin });

  return (
    <div>
      <h1 className="text-xl font-medium">Entrar</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">Acesse seu espaço de trabalho.</p>
      {error ? (
        <p role="alert" className="mb-4 rounded-field bg-critical/10 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      ) : null}
      {first(params.senha) === 'atualizada' ? (
        <p role="status" className="mb-4 rounded-field bg-positive/10 px-3 py-2 text-sm text-ink">
          Senha atualizada. Entre com sua nova senha.
        </p>
      ) : null}
      {google ? <GoogleSignIn callbackUrl={callbackUrl} /> : null}
      <AuthForm
        action={login}
        submitLabel="Entrar"
        hidden={{ callbackUrl }}
        fields={[
          { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
          { name: 'password', label: 'Senha', type: 'password', autoComplete: 'current-password' },
        ]}
      />
      <Link href="/login/recuperar-senha" className="mt-3 inline-block text-sm font-medium underline">Esqueci minha senha</Link>
      {demoEnabled() ? (
        <div className="mt-6">
          <form action={demoLogin}>
            <button
              type="submit"
              className={buttonClass({ variant: 'tonal', size: 'lg', className: 'w-full' })}
            >
              Explorar a demonstração <span className="t-learn-arrow">→</span>
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-2">
            Explore um espaço de trabalho com candidatos, entrevistas e uma proposta de exemplo, sem precisar criar conta.
          </p>
        </div>
      ) : null}
      <p className="mt-6 text-sm text-ink-2">
        Primeiro acesso?{' '}
        <Link href="/signup" className="font-medium text-ink hover:underline">
          Criar uma organização
        </Link>
      </p>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
