import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isDemoCareers, publicClientSelect } from '@/server/public-careers';
import { publicClientName, publicPostingText } from '@/lib/public-careers';

function cdata(text: string): string {
  return `<![CDATA[${text.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Job-board XML feed in the de-facto Indeed/aggregator format
 * (docs/02 §3 "Job board distribution"). Point free aggregators at
 * /api/careers/<org>/feed.xml — applications land through the hosted apply
 * flow with the board captured via ?utm_source on the posting URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params;
  // Sample boards' roles aren't real: never hand them to an aggregator.
  if (isDemoCareers(orgSlug)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const base = new URL(request.url).origin;
  const postings = await db.posting.findMany({
    where: { orgId: org.id, state: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    include: { clientCompany: { select: publicClientSelect } },
  });

  const jobs = postings
    .map((p) => {
      const employer = publicClientName(p) ?? (org.kind === 'AGENCY' || p.clientCompany ? 'Confidencial' : org.name);
      const description = publicPostingText(p.content).description || p.title;
      return [
        '  <job>',
        `    <title>${cdata(p.title)}</title>`,
        `    <date>${cdata(p.createdAt.toUTCString())}</date>`,
        `    <referencenumber>${cdata(p.id)}</referencenumber>`,
        `    <url>${cdata(`${base}/careers/${org.slug}/${p.slug}?utm_source=jobboard`)}</url>`,
        `    <company>${cdata(employer)}</company>`,
        `    <city>${cdata(p.location ?? '')}</city>`,
        `    <description>${cdata(description)}</description>`,
        `    <jobtype>${cdata(p.commitment.toLowerCase().replace('_', ''))}</jobtype>`,
        ...(p.salaryMin || p.salaryMax
          ? [`    <salary>${cdata(`${p.salaryCurrency ?? ''} ${p.salaryMin ?? ''}-${p.salaryMax ?? ''}`.trim())}</salary>`]
          : []),
        `    <remotetype>${cdata(p.workplaceType === 'REMOTE' ? 'Fully remote' : p.workplaceType === 'HYBRID' ? 'Hybrid' : '')}</remotetype>`,
        '  </job>',
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${cdata(org.name)}</publisher>
  <publisherurl>${cdata(`${base}/careers/${org.slug}`)}</publisherurl>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${jobs}
</source>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' },
  });
}
