'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AuthForm } from '@/components/auth-form';
import { saveNewPassword } from '@/app/(auth)/password-actions';

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const readToken = () => {
      const { hash, pathname, search } = window.location;
      const value = new URLSearchParams(hash.slice(1)).get('token') ?? '';
      setToken(value);
      if (hash) window.history.replaceState(window.history.state, '', pathname + search);
    };
    if (!initialized.current) {
      initialized.current = true;
      readToken();
    }
    window.addEventListener('hashchange', readToken);
    return () => window.removeEventListener('hashchange', readToken);
  }, []);

  if (token === null) return <p role="status" className="text-sm text-ink-2">Carregando…</p>;

  return (
    <>
      {/^[A-Za-z0-9_-]{43}$/.test(token) ? (
        <AuthForm key={token} action={saveNewPassword} submitLabel="Salvar nova senha" hidden={{ token }}
          fields={[
            { name: 'password', label: 'Nova senha', type: 'password', autoComplete: 'new-password' },
            { name: 'confirmation', label: 'Confirme a nova senha', type: 'password', autoComplete: 'new-password' },
          ]} />
      ) : (
        <p role="alert" className="text-sm text-ink-2">Este link é inválido ou expirou. Solicite um novo link de recuperação.</p>
      )}
      <Link href="/login/recuperar-senha" className="mt-6 inline-block text-sm font-medium underline">Solicitar outro link</Link>
    </>
  );
}
