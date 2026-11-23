'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';

export function CareersShare() {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('Link copiado.');
    } catch {
      setMessage('Copie o link pela barra de endereço.');
    }
  }

  return (
    <div className="min-w-0">
      <button type="button" onClick={copy} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        <Link2 size={15} aria-hidden="true" /> Copiar link
      </button>
      <span role="status" className="ml-2 text-xs text-ink-2">{message}</span>
    </div>
  );
}
