'use client';

import { appLocale } from '@/lib/i18n';
import { useEffect, useState } from 'react';

/**
 * Renders a timestamp in the VIEWER's timezone. Server components render
 * dates in the server's timezone — wrong for anyone not sitting next to
 * the deployment. Renders the UTC form first (matching the server) and
 * swaps to local time after hydration to avoid a mismatch warning.
 */
export function LocalTime({
  date,
  options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
}: {
  date: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const d = new Date(date);
  const format = { ...options, hour12: false };
  return (
    <time dateTime={date} suppressHydrationWarning>
      {mounted ? d.toLocaleString(appLocale, format) : d.toLocaleString(appLocale, { ...format, timeZone: 'UTC' })}
    </time>
  );
}
