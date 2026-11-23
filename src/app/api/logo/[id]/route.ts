import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicPostingLogo } from '@/lib/public-careers';
import { publicClientSelect } from '@/server/public-careers';
import { fileResponseHeaders, openStoredFile, StoredFileMissingError } from '@/server/storage';

/** Serve public organization logos and approved published posting logos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.storedFile.findUnique({ where: { id } });
  if (!file || file.contactId || !file.mime.startsWith('image/')) return new NextResponse('Not found', { status: 404 });

  const [org, postings] = await Promise.all([
    db.organization.findFirst({ where: { id: file.orgId, logoFileId: id }, select: { id: true } }),
    db.posting.findMany({
      where: { orgId: file.orgId, logoFileId: id },
      select: {
        orgId: true, state: true, content: true, logoFileId: true, org: { select: { kind: true } },
        clientCompany: { select: publicClientSelect },
      },
    }),
  ]);
  const isPublic = !!org || postings.some((p) => p.state === 'PUBLISHED' && publicPostingLogo(p, p.org.kind === 'AGENCY') === id);
  if (!isPublic) {
    const session = postings.length ? await auth() : null;
    if (session?.user?.orgId !== file.orgId) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  let body: ReadableStream<Uint8Array>;
  try {
    body = await openStoredFile(file.key);
  } catch (err) {
    if (err instanceof StoredFileMissingError) return new NextResponse('Not found', { status: 404 });
    throw err;
  }
  return new NextResponse(body, {
    headers: {
      ...fileResponseHeaders(file, org ? 'public, max-age=3600' : 'private, no-store', { allowSvg: true }),
      'Content-Length': String(file.size),
    },
  });
}
