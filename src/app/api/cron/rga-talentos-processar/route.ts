import { NextResponse } from 'next/server';
import { talentSchedulerAuthorized } from '@/server/rga-scheduler-auth';
import { processTalentSummaries } from '@/server/talent-summary';
import { processTalentSync } from '@/server/talent-sync-run';

export const maxDuration = 300;
export async function POST(request: Request) {
  if (!await talentSchedulerAuthorized(request)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
  const orgId = process.env.RGA_TALENT_SYNC_ORG_ID;
  if (!orgId) return NextResponse.json({ enabled: false });
  const sync = await processTalentSync(orgId);
  const summaries = await processTalentSummaries(orgId);
  return NextResponse.json({ sync, summaries }, { status: sync.status === 'FAILED' ? 503 : 200 });
}
