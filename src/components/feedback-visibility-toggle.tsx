'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFeedbackVisibilityAction } from '@/app/org-actions';
import { Switch } from '@/components/switch';
import { TextSwap } from '@/components/ui/motion';

export function FeedbackVisibilityToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={enabled}
        disabled={pending}
        label="Avaliações independentes"
        onChange={(next) =>
          startTransition(async () => {
            await setFeedbackVisibilityAction(next);
            router.refresh();
          })
        }
      />
      <span className="text-xs text-ink-2">
        <TextSwap>{pending ? 'Salvando…' : enabled ? 'Ocultas até o envio' : 'Avaliações visíveis'}</TextSwap>
      </span>
    </div>
  );
}
