import { organization } from '@/lib/i18n/pt-BR/organization';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AuthForm } from '@/components/auth-form';
import { isSingleWorkspace } from '@/server/rga-workspace';
import { SIGNUP_KIND_COOKIE } from '@/lib/signup-kind';
import { finishGoogleSignup } from '../../actions';
import {
  googleAuthEnabled,
  loginErrorPath,
  pendingIdentity,
  readPendingGoogle,
  resolveGoogle,
} from '@/server/google-auth';

export const metadata = { title: 'Conclua a criação do seu espaço de trabalho' };

export const dynamic = 'force-dynamic';

/**
 * After Google, for a verified address with no account yet: the password
 * sign-up's questions minus the email and password, which Google answered.
 */
export default async function FinishSignupPage() {
  if (isSingleWorkspace()) redirect('/login');
  if (!googleAuthEnabled()) redirect('/signup');
  const pending = await readPendingGoogle();
  if (!pending) redirect(loginErrorPath('expired'));

  // An account may have appeared since (an invite, another tab): sign in to it instead.
  const { resolution } = await resolveGoogle(pendingIdentity(pending));
  if (resolution.kind === 'refused') redirect(loginErrorPath(resolution.reason));
  if (resolution.kind !== 'create-workspace') redirect('/login/workspace');
  const agency = (await cookies()).get(SIGNUP_KIND_COOKIE)?.value === 'agency';

  return (
    <div>
      <h1 className="text-xl font-medium">Conclua a criação do seu espaço de trabalho</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">
        Você entrou com a conta Google <span className="text-ink">{pending.email}</span>.
        Dê um nome à sua organização para concluir. Você terá acesso de administrador principal.
      </p>
      <AuthForm
        action={finishGoogleSignup}
        hidden={agency ? { kind: 'agency' } : undefined}
        submitLabel="Criar espaço de trabalho"
        fields={[
          { name: 'orgName', label: agency ? organization.signup.agencyName : organization.signup.companyName, type: 'text', placeholder: agency ? organization.signup.agencyExample : organization.signup.companyExample },
          {
            name: 'name',
            label: 'Seu nome',
            type: 'text',
            autoComplete: 'name',
            defaultValue: pending.name,
          },
        ]}
      />
      <p className="mt-6 text-sm text-ink-2">
        Esta conta é sua?{' '}
        <Link href="/signup" className="font-medium text-ink hover:underline">
          Recomeçar
        </Link>
      </p>
    </div>
  );
}
