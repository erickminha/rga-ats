import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { readShortlistShare, resolveShare } from '@/server/share-links';
import { makeOpinionPdf, orgOpinionBrand, pdfResponse } from '@/server/opinion-pdf';
import { fileResponseHeaders, openStoredFile, StoredFileMissingError } from '@/server/storage';

const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const token = (await cookies()).get('rga-share-access')?.value;
  const share = token && await resolveShare(token);
  if (!share || share.scope !== 'shortlist') return missing();
  const presentation = await readShortlistShare(share);
  const candidate = presentation?.finalists.find((person) => person.id === id);
  if (!presentation || !candidate) return missing();
  if (kind === 'parecer' && candidate.opinionPdf) {
    const brand = await orgOpinionBrand(share.orgId);
    if (!brand) return missing();
    const { content, issuedAt, version } = candidate.opinionPdf;
    return pdfResponse(await makeOpinionPdf({ metadata: { candidate: candidate.name, posting: presentation.title,
      client: presentation.client, author: '', organization: brand.name }, content, issuedAt, version, color: brand.color, logo: brand.logo }));
  }
  const fileId = kind === 'curriculo' ? candidate.resumeId : kind === 'disc' ? candidate.discId : null;
  if (!fileId) return missing();
  const file = await db.storedFile.findFirst({ where: { id: fileId, orgId: share.orgId, deletePendingAt: null } });
  if (!file) return missing();
  try {
    const headers = fileResponseHeaders(file, 'private, no-store');
    return new Response(await openStoredFile(file.key), { headers: { ...headers,
      'Content-Disposition': headers['Content-Disposition'].replace(/^inline/, 'attachment'),
      'Content-Length': String(file.size),
      'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof StoredFileMissingError) return missing();
    throw error;
  }
}
