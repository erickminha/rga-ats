'use client';

import { approvalError, dashboard } from '@/lib/i18n/pt-BR/dashboard';
import type { ApprovalSubject } from '@prisma/client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { resolveApprovalAction } from '@/app/(app)/actions';
import { surface } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/primitives';

export type ApprovalQueueItem = {
  id: string;
  subjectType: ApprovalSubject;
  title: string;
  href: string;
  requestedByName: string | null;
};

export function ApprovalQueue({ items }: { items: ApprovalQueueItem[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={`${surface} p-5`}>
      <h2 className="text-md font-medium text-ink">{dashboard.approvals.title}</h2>
      {error ? <p role="alert" className="mt-2 text-sm text-critical">{error}</p> : null}
      <div className="-mx-2 mt-3 flex flex-col gap-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-field px-2 py-2 transition-colors duration-[120ms] hover:bg-muted/60"
          >
            <Link href={item.href} className="flex items-center gap-2.5 text-sm font-medium">
              <StatusDot tone="caution" />
              <span className="min-w-0 truncate">{item.title}</span>
            </Link>
            <p className="mt-0.5 pl-4 text-xs text-ink-2">
              <span>{dashboard.approvals.subjects[item.subjectType]}</span>
              {item.requestedByName ? ` · ${item.requestedByName}` : ''}
            </p>
            <div className="mt-2 flex gap-1 pl-4">
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resolveApprovalAction(item.id, 'APPROVED');
                    setError(result.error ? approvalError(result.error) : null);
                  })
                }
                className={buttonClass({ variant: 'tonal', size: 'xs' })}
              >
                {dashboard.approvals.approve}
              </button>
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resolveApprovalAction(item.id, 'REJECTED');
                    setError(result.error ? approvalError(result.error) : null);
                  })
                }
                className={buttonClass({ variant: 'ghost', size: 'xs' })}
              >
                {dashboard.approvals.reject}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
