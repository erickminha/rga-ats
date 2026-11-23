'use client';

import { useTransition } from 'react';
import { setNetworkConsentAction } from '@/app/portal/actions';
import { surface } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { TextSwap } from '@/components/ui/motion';

export function NetworkConsentToggle({ token, optedIn }: { token: string; optedIn: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`${surface} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-medium">Visibilidade do perfil na rede de talentos</p>
        <p className="mt-0.5 text-xs text-ink-2">
          {optedIn
            ? 'Outros empregadores na rede podem encontrar os dados que você enviou. Anotações de entrevista e avaliações ficam privadas.'
            : 'Seu perfil está fora da busca de outros empregadores na rede.'}
        </p>
      </div>
      <button
        disabled={pending}
        onClick={() => startTransition(() => setNetworkConsentAction(token, !optedIn))}
        className={buttonClass({ variant: 'tonal', size: 'sm' })}
      >
        <TextSwap>{pending ? 'Salvando…' : optedIn ? 'Retirar autorização' : 'Autorizar'}</TextSwap>
      </button>
    </div>
  );
}
