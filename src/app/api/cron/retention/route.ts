import { cronAuthorized, takeCronLease } from '@/server/cron';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { processRetention } from '@/server/retention';

/**
 * Policy-driven anonymization of long-archived candidates. Daily is plenty.
 * Same auth contract as the other cron routes: CRON_SECRET bearer, open in
 * local dev when unset.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const release = await takeCronLease('retention', new Date(Date.now() + 15 * 60_000));
  if (!release) return NextResponse.json({ busy: true });
  try {
    const anonymized = await processRetention();
    const pendingFiles = await db.storedFile.count({ where: { deletePendingAt: { not: null } } });
    return NextResponse.json({ anonymized, pendingFiles });
  } finally {
    await release();
  }
}
