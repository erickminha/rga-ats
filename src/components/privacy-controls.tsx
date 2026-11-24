'use client';

import { useState, useTransition } from 'react';
import { managePrivacyAction } from '@/app/(app)/privacy-actions';
import { buttonClass } from '@/components/ui/button';

export function PrivacyControls({ contactId, onHold }: { contactId: string; onHold: boolean }) {
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const button = buttonClass({ variant: 'tonal', size: 'sm' });

  function submit(action: 'hold' | 'release' | 'erase') {
    if (action === 'erase' && !window.confirm('Anonimizar o cadastro e solicitar a remoção de currículos e anexos? A ação é irreversível.')) return;
    startTransition(async () => {
      try {
        setNotice(await managePrivacyAction(contactId, action));
      } catch {
        setNotice('Não foi possível concluir a solicitação. Tente novamente.');
      }
    });
  }

  return (
    <section aria-label="Solicitações de privacidade" className="grid gap-3">
      <h2 className="text-sm font-semibold">Solicitações de privacidade</h2>
      <p className="text-xs text-ink-2">Verifique a identidade do titular antes de exportar, corrigir ou anonimizar seus dados.</p>
      <div className="flex flex-wrap gap-2">
        <a className={button} href={`/api/contacts/${contactId}/export`}>Exportar dados</a>
        <button type="button" className={button} disabled={pending} onClick={() => submit(onHold ? 'release' : 'hold')}>
          {onHold ? 'Liberar retenção' : 'Bloquear anonimização'}
        </button>
        <button type="button" className={button} disabled={pending || onHold} onClick={() => submit('erase')}>
          Anonimizar
        </button>
      </div>
      <p role="status" className="text-xs text-ink-2">{notice}</p>
    </section>
  );
}
