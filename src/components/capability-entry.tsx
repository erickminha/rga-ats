'use client';

import { useEffect, useRef, useState } from 'react';
import { openCapability } from '@/app/link-access';
import type { CapabilityKind } from '@/lib/capability-links';

export function CapabilityEntry({ kind }: { kind: CapabilityKind }) {
  const [invalid, setInvalid] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setInvalid(true); return; }
    void openCapability(kind, token).then(() => setInvalid(true), () => setInvalid(true));
  }, [kind]);

  return <main className="mx-auto max-w-lg px-6 py-16">
    <p role="status">{invalid ? 'Link inválido ou expirado. Solicite um novo link.' : 'Abrindo link seguro…'}</p>
    <noscript>Ative o JavaScript para abrir este link.</noscript>
  </main>;
}
