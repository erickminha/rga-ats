import { NextResponse } from 'next/server';
import { talentSchedulerAuthorized } from '@/server/rga-scheduler-auth';
import { enqueueTalentSync, processTalentSync, talentSyncConfigured } from '@/server/talent-sync-run';

export const maxDuration = 300;
export async function POST(request: Request) {
  if (!await talentSchedulerAuthorized(request)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
  if (process.env.RGA_TALENT_SYNC_DAILY !== 'true') return NextResponse.json({ enabled: false });
  const orgId = process.env.RGA_TALENT_SYNC_ORG_ID;
  if (!orgId || !talentSyncConfigured(orgId)) return NextResponse.json({ error: 'Integração indisponível.' }, { status: 503 });
  await enqueueTalentSync(orgId, 'daily', null);
  return NextResponse.json(await processTalentSync(orgId));
}
