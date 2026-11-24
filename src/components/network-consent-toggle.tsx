'use client';

import { useTransition } from 'react';
import { setPortalPreferenceAction } from '@/app/portal/actions';
import { surface } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { TextSwap } from '@/components/ui/motion';

export function NetworkConsentToggle({ token, optedIn, profileStorage = false }: {
  token: string;
  optedIn: boolean;
  profileStorage?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`${surface} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-medium">{profileStorage ? 'Guardar perfil para futuras vagas' : 'Visibilidade do perfil na rede de talentos'}</p>
        <p className="mt-0.5 text-xs text-ink-2">
          {profileStorage
            ? 'Esta preferência é opcional. A equipe ainda precisa tratar os dados da seleção em andamento e respeitar obrigações de retenção.'
            : optedIn
            ? 'Outros empregadores na rede podem encontrar os dados que você enviou. Anotações de entrevista e avaliações ficam privadas.'
            : 'Seu perfil está fora da busca de outros empregadores na rede.'}
        </p>
      </div>
      <button
        disabled={pending}
        onClick={() => startTransition(() => setPortalPreferenceAction(token, !optedIn, profileStorage))}
        className={buttonClass({ variant: 'tonal', size: 'sm' })}
      >
        <TextSwap>{pending ? 'Salvando…' : optedIn ? 'Retirar autorização' : 'Autorizar'}</TextSwap>
      </button>
    </div>
  );
}
