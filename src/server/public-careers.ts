import { cache } from 'react';
import { db } from '@/lib/db';
import { appBaseUrl } from '@/lib/base-url';
import { headers } from 'next/headers';
import { ensureSampleBoard, isSampleSlug } from '@/server/sample-boards';

export const publicClientSelect = { id: true, orgId: true, name: true } as const;

export const careersOrganization = cache(async (slug: string) => {
  if (isSampleSlug(slug)) await ensureSampleBoard(slug);
  return db.organization.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, kind: true, brand: true, logoFileId: true,
      talentNetworkEnabled: true, collectEeo: true,
    },
  });
});

export const publishedPosting = cache((orgId: string, slug: string) => db.posting.findFirst({
  where: { orgId, slug, state: 'PUBLISHED' },
  select: {
    id: true, orgId: true, slug: true, title: true, location: true, workplaceType: true,
    commitment: true, salaryMin: true, salaryMax: true, salaryCurrency: true, content: true,
    logoFileId: true, department: { select: { name: true, orgId: true } },
    clientCompany: { select: publicClientSelect },
  },
}));

export const isDemoCareers = (slug: string) => /^demo(?:-[a-z0-9]{5})?$/.test(slug) || isSampleSlug(slug);

export async function careersOrigin() {
  if (process.env.AUTH_URL || process.env.VERCEL_ENV === 'production') return appBaseUrl();
  const request = await headers();
  const host = request.get('host');
  if (!host || !/^[a-z0-9.\-]+(?::[0-9]+)?$/i.test(host)) return appBaseUrl();
  const protocol = request.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

export async function publicationDate(orgId: string, postingId: string) {
  const event = await db.event.findFirst({
    where: {
      orgId, subjectType: 'posting', subjectId: postingId,
      verb: { in: ['posting.published', 'posting.approved'] },
      AND: [{ payload: { path: ['to'], equals: 'PUBLISHED' } }, { NOT: { payload: { path: ['from'], equals: 'PUBLISHED' } } }],
    },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  });
  return event?.occurredAt ?? null;
}
