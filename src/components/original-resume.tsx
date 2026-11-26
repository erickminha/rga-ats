'use client';

import { useState, useTransition } from 'react';
import { originalResumeAction } from '@/app/(app)/contacts/[id]/curriculo-drive/actions';
import { buttonClass } from '@/components/ui/button';

export function OriginalResume({ contactId, prominent = false }: { contactId: string; prominent?: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const className = prominent ? buttonClass({ variant: 'secondary', size: 'sm' }) : 'underline';
  return <div className="text-sm">
    <button type="button" className={className} disabled={pending} onClick={() => {
      const tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
      setMessage('');
      setLink('');
      start(async () => {
        try {
          const result = await originalResumeAction(contactId);
          if (result.url) {
            if (tab && !tab.closed) tab.location.replace(result.url);
            else setLink(result.url);
            return;
          }
          setMessage(result.error ?? 'Currículo original indisponível.');
        } catch { setMessage('A consulta falhou. Tente novamente.'); }
        tab?.close();
      });
    }}>{pending ? 'Buscando currículo…' : 'Ver currículo no Drive'}</button>
    {link && <a href={link} target="_blank" rel="noreferrer" className="ml-2 underline">Abrir currículo</a>}
    {message && <p role="status">{message}</p>}
  </div>;
}
