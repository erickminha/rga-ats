'use client';

import { useState, useTransition } from 'react';
import { originalResumeAction } from '@/app/(app)/contacts/[id]/curriculo-drive/actions';

export function OriginalResume({ contactId }: { contactId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return <div className="text-sm">
    <button type="button" className="underline" disabled={pending} onClick={() => {
      const tab = window.open('about:blank', '_blank');
      if (!tab) { setError(true); return; }
      tab.opener = null;
      setError(false);
      start(async () => {
        try {
          const result = await originalResumeAction(contactId);
          if (result.url) { tab.location.replace(result.url); return; }
        } catch { /* Show the same availability message on connection failure. */ }
        tab.close();
        setError(true);
      });
    }}>{pending ? 'Buscando currículo…' : 'Ver currículo no Drive'}</button>
    {error && <p role="status">Currículo original indisponível. Confira o vínculo e o acesso à planilha.</p>}
  </div>;
}
