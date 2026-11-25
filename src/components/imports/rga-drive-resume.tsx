'use client';

import { useState, useTransition } from 'react';
import { driveResumeAction } from '@/app/(app)/contacts/[id]/curriculo-drive/actions';

export function RgaDriveResume({ contactId }: { contactId: string }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof driveResumeAction>>>();
  const [pending, start] = useTransition();
  function run(ticket?: string) {
    start(async () => {
      try { setState(await driveResumeAction(contactId, ticket)); }
      catch { setState({ error: 'Falha de conexão. Consulte os documentos vinculados e gere outra prévia.' }); }
    });
  }
  return <div className="my-3 grid gap-2 rounded-field border border-line p-3 text-sm">
    <button className="justify-self-start underline" type="button" disabled={pending} onClick={() => run()}>Conferir currículo da planilha original</button>
    {pending && <p role="status">Consultando documento…</p>}
    {state?.preview && <div>
      <p>Versão {state.preview.version} na origem · {(state.preview.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB</p>
      <button type="button" className="underline" disabled={pending} onClick={() => run(state.preview?.ticket)}>Confirmar cópia privada do currículo</button>
    </div>}
    {state?.message && <p role="status">{state.message}</p>}
    {state?.error && <p role="alert">{state.error}</p>}
  </div>;
}
