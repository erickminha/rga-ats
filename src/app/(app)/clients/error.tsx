'use client';

import { buttonClass } from '@/components/ui/button';

export default function ClientsError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-6 mt-8 grid justify-items-start gap-3">
      <h1 className="text-xl font-medium">Não foi possível carregar as empresas clientes.</h1>
      <button type="button" onClick={reset} className={buttonClass({ variant: 'tonal' })}>Tentar novamente</button>
    </div>
  );
}
