import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/session';
import { resumeAccess } from '@/server/interview-access';
import { db } from '@/lib/db';
import { fileResponseHeaders, openStoredFile, StoredFileMissingError } from '@/server/storage';

/** Org-scoped file download (resumes, attachments). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const file = await db.storedFile.findFirst({
    where: { ...resumeAccess(ctx), id, deletePendingAt: null },
  });
  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: ReadableStream<Uint8Array>;
  try {
    body = await openStoredFile(file.key);
  } catch (err) {
    if (err instanceof StoredFileMissingError) return NextResponse.json({ error: 'not found' }, { status: 404 });
    throw err;
  }
  // Streamed, so files of any size download (Vercel caps buffered responses at 4.5 MB).
  return new NextResponse(body, {
    headers: { ...fileResponseHeaders(file, 'private, no-store'), 'Content-Length': String(file.size) },
  });
}
