import { cronAuthorized, takeCronLease } from '@/server/cron';
import { NextResponse } from 'next/server';
import { processDueEmails } from '@/server/email';
import { processFeedbackReminders } from '@/server/feedback';
import { processReportSchedules } from '@/server/analytics';

/**
 * Delivers scheduled emails that are due. Wire to Vercel Cron (vercel.json)
 * on the managed deployment, or any cron + curl when self-hosting:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/emails
 * If CRON_SECRET is unset (local dev), the endpoint is open.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const release = await takeCronLease('emails', new Date(Date.now() + 15 * 60_000));
  if (!release) return NextResponse.json({ busy: true });
  try {
    const delivered = await processDueEmails();
    const reminders = await processFeedbackReminders();
    const digests = await processReportSchedules();
    return NextResponse.json({ delivered, reminders, digests });
  } finally {
    await release();
  }
}
