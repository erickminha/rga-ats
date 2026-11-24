'use client';

import { useEffect, useRef, useState } from 'react';

/** Fetch the private document only while the recruiter is viewing it. */
export function ResumePreview({ fileId }: { fileId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);
  const [message, setMessage] = useState('');
  const href = '/api/files/' + encodeURIComponent(fileId);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl = '';
    async function load() {
      try {
        const response = await fetch(href, { signal: controller.signal, cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error();
        const mime = response.headers.get('Content-Type')?.split(';')[0];
        if (!mime || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
          setMessage('Este formato pode ser aberto após baixar o arquivo.');
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, mime });
      } catch {
        if (!controller.signal.aborted) setMessage('Documento indisponível ou sem permissão de acesso.');
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [href, open]);

  return <>
    <button type="button" className="text-sm underline" onClick={() => {
      setPreview(null); setMessage(''); setOpen(true); dialog.current?.showModal();
    }}>Visualizar currículo</button>
    <dialog ref={dialog} aria-label="Visualização do currículo" onClose={() => setOpen(false)}
      className="m-auto w-[min(94vw,60rem)] rounded-card bg-surface p-4 text-ink backdrop:bg-black/50">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Currículo</h2>
        <button type="button" className="underline" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>
      {open && (preview ? preview.mime === 'application/pdf'
        ? <iframe title="Documento PDF" className="h-[65dvh] w-full" src={preview.url} />
        : <img alt="Currículo digitalizado" className="mx-auto max-h-[65dvh] max-w-full object-contain" src={preview.url} />
        : <p role="status" className="py-4">{message || 'Carregando documento…'}</p>)}
      <a href={href} download className="mt-2 inline-block text-sm underline">Baixar arquivo</a>
    </dialog>
  </>;
}
