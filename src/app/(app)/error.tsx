'use client';

import { appFeedback } from '@/lib/i18n/pt-BR/navigation';
import { btnSecondary } from '@/components/form-controls';

/**
 * Friendly catch-all for the app shell. Server actions in production hide
 * error details behind a digest, so speak human here and offer a retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message =
    error.message && error.message.length < 120 && !error.message.includes('digest')
      ? error.message
      : appFeedback.errorMessage;
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-medium text-ink-2">{appFeedback.error}</p>
      <h1 className="max-w-prose text-xl font-medium text-ink">{message}</h1>
      <p className="max-w-sm text-sm text-ink-2">
        {appFeedback.retryHint}
      </p>
      <button type="button" onClick={reset} className={`${btnSecondary} mt-2`}>
        {appFeedback.retry}
      </button>
    </div>
  );
}
