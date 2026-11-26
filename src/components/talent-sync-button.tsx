'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncTalentNow } from '@/app/(app)/contacts/sincronizar/actions';
import { buttonClass } from '@/components/ui/button';

export function TalentSyncButton({ enabled, active }: { enabled: boolean; active: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" disabled={pending || !enabled || active} className={buttonClass({ variant: 'primary' })} onClick={() => start(async () => {
      const result = await syncTalentNow();
      setMessage(result.error ?? 'Sincronização enfileirada. Você pode sair da página.');
      router.refresh();
    })}>Sincronizar banco de talentos</button>
    <button type="button" className="text-sm underline" onClick={() => router.refresh()}>Atualizar estado</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
