'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type { AuthFormState } from './actions';
import { requestPasswordReset, resetEmailAddress, resetPassword, validResetPassword } from '@/server/password-reset';

export async function requestRecovery(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = resetEmailAddress(String(form.get('email') ?? ''));
  if (!email) return { error: 'Informe um e-mail válido.' };
  after(async () => {
    try {
      await requestPasswordReset(email);
    } catch {
      console.warn('[password-reset] REQUEST_FAILED');
    }
  });
  redirect('/login/recuperar-senha?solicitado=1');
}

export async function saveNewPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = String(form.get('password') ?? '');
  if (!validResetPassword(password)) {
    return { error: 'Use pelo menos 8 caracteres. O limite é de 72 bytes em UTF-8.' };
  }
  if (password !== form.get('confirmation')) return { error: 'As duas senhas precisam ser iguais.' };
  try {
    if (!await resetPassword(String(form.get('token') ?? ''), password)) {
      return { error: 'Este link é inválido, expirou ou já foi usado. Solicite outro link de recuperação.' };
    }
  } catch {
    console.warn('[password-reset] UPDATE_FAILED');
    return { error: 'Não foi possível alterar a senha. Tente novamente.' };
  }
  redirect('/login?senha=atualizada');
}
