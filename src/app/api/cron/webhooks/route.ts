import { cronAuthorized, takeCronLease } from '@/server/cron';
import { NextResponse } from 'next/server';
import { processWebhooks } from '@/server/webhooks';

/** Webhook dispatcher — Vercel Cron on managed, any cron + curl self-hosted. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const release = await takeCronLease('webhooks', new Date(Date.now() + 15 * 60_000));
  if (!release) return NextResponse.json({ busy: true });
  try {
    const delivered = await processWebhooks();
    return NextResponse.json({ delivered });
  } finally {
    await release();
  }
}
