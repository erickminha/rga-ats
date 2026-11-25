import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/server/cron';
import { syncTalentBatch } from '@/server/imports/rga-talent-sync';

export const maxDuration = 300;
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
  if (process.env.RGA_TALENT_SYNC_DAILY !== 'true') return NextResponse.json({ enabled: false });
  const orgId = process.env.RGA_TALENT_SYNC_ORG_ID;
  const userId = process.env.RGA_TALENT_SYNC_ADMIN_ID;
  if (!orgId || !userId) return NextResponse.json({ error: 'Responsável pela sincronização não configurado.' }, { status: 503 });
  const user = await db.user.findFirst({ where: { orgId, id: userId, deactivatedAt: null, accessRole: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { accessRole: true } });
  if (!user) return NextResponse.json({ error: 'A autorização administrativa precisa ser revisada.' }, { status: 403 });
  try {
    const result = await syncTalentBatch({ orgId, userId, accessRole: user.accessRole }, 'scheduled');
    return NextResponse.json({ processed: result.count, unresolved: result.unresolved, remaining: result.changed - result.count, errors: result.report?.errors ?? 0 });
  } catch { return NextResponse.json({ error: 'A sincronização precisa ser repetida.' }, { status: 503 }); }
}
