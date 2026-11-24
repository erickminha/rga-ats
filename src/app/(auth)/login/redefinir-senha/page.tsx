import { ResetPasswordForm } from '@/components/reset-password-form';

export const metadata = {
  title: 'Cadastrar nova senha',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
} as const;

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="mb-3 text-xl font-medium">Cadastrar nova senha</h1>
      <ResetPasswordForm />
    </div>
  );
}
