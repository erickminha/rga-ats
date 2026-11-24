'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { capabilityKinds, type CapabilityKind } from '@/lib/capability-links';
import { resolveShare } from '@/server/share-links';
import { verifyPortalToken } from '@/lib/portal-token';
import { getSchedulingLink } from '@/server/scheduling';
import { getOfferByToken } from '@/server/offers';

export async function openCapability(kind: CapabilityKind, token: string) {
  if (!capabilityKinds.includes(kind) || typeof token !== 'string' || !/^[A-Za-z0-9_.-]{12,2048}$/.test(token)) return;
  const found = kind === 'share' ? await resolveShare(token)
    : kind === 'portal' ? verifyPortalToken(token)
      : kind === 'schedule' ? await getSchedulingLink(token) : await getOfferByToken(token);
  if (!found) return;
  (await cookies()).set(`rga-${kind}-access`, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: `/${kind}`, maxAge: 30 * 60,
  });
  redirect(`/${kind}/view`);
}
