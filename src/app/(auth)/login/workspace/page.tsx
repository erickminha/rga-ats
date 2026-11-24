import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSingleWorkspace } from '@/server/rga-workspace';
import { WorkspaceChoice } from '@/components/google-auth';
import {
  googleAuthEnabled,
  loginErrorPath,
  pendingIdentity,
  readPendingGoogle,
  resolveGoogle,
  workspaceOptions,
} from '@/server/google-auth';

export const metadata = { title: "Selecione um espaço de trabalho" };

export const dynamic = 'force-dynamic';

/**
 * After Google, for an address that belongs to more than one workspace:
 * pick which one to sign in to. The list is worked out again here from the
 * sealed Google identity, never from the URL.
 */
export default async function ChooseWorkspacePage() {
  if (!googleAuthEnabled()) redirect('/login');
  const pending = await readPendingGoogle();
  if (!pending) redirect(loginErrorPath('expired'));

  const { resolution, candidates } = await resolveGoogle(pendingIdentity(pending));
  if (resolution.kind === 'create-workspace') redirect(isSingleWorkspace() ? loginErrorPath('signup-closed') : '/signup/finish');
  if (resolution.kind === 'refused') redirect(loginErrorPath(resolution.reason));
  const options = workspaceOptions(resolution, candidates);

  return (
    <div>
      <h1 className="text-xl font-medium">Selecione um espaço de trabalho</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">
        {options.length > 1 ? (
          <>
            <span className="text-ink">{pending.email}</span> pertence a mais de um espaço de trabalho. Qual deseja abrir?
          </>
        ) : (
          <>
            Continuar como <span className="text-ink">{pending.email}</span>.
          </>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <WorkspaceChoice key={o.userId} userId={o.userId} orgName={o.orgName} />
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-2">
        Esta conta é sua?{' '}
        <Link href="/login" className="font-medium text-ink hover:underline">
          Usar outra conta
        </Link>
      </p>
    </div>
  );
}
