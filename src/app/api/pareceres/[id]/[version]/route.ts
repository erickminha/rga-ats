import { getSessionContext, canManageRecruiting } from '@/lib/session';
import { db } from '@/lib/db';
import { makeOpinionPdf, orgOpinionBrand, pdfResponse, textRecord } from '@/server/opinion-pdf';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx || !canManageRecruiting(ctx)) return new Response(null, { status: ctx ? 404 : 401 });
  const { id, version: raw } = await params;
  if (raw === 'preview') {
    const [row, brand] = await Promise.all([
      db.opportunity.findFirst({ where: { id, orgId: ctx.orgId, contact: { orgId: ctx.orgId, isAnonymized: false, retentionHold: false } },
        select: { contact: { select: { name: true } }, posting: { select: { orgId: true, title: true, clientCompany: { select: { orgId: true, name: true } } } },
          recruitingAssessment: { select: { opinion: true, opinionDraftAt: true, opinionAuthorId: true } } } }),
      orgOpinionBrand(ctx.orgId),
    ]);
    if (!row?.recruitingAssessment?.opinionDraftAt || !brand) return new Response(null, { status: 404 });
    const author = await db.user.findFirst({ where: { orgId: ctx.orgId, id: row.recruitingAssessment.opinionAuthorId ?? '' }, select: { name: true } });
    const posting = row.posting?.orgId === ctx.orgId ? row.posting : null;
    const bytes = await makeOpinionPdf({ metadata: { candidate: row.contact.name, posting: posting?.title ?? '', client: posting?.clientCompany?.orgId === ctx.orgId ? posting.clientCompany.name : '', author: author?.name ?? '', organization: brand.name },
      content: textRecord(row.recruitingAssessment.opinion), issuedAt: row.recruitingAssessment.opinionDraftAt, version: 0, draft: true, color: brand.color, logo: brand.logo });
    return pdfResponse(bytes);
  }
  const version = Number(raw);
  if (!/^\d{1,8}$/.test(raw) || version < 1) return new Response(null, { status: 404 });
  const [issued, brand] = await Promise.all([
    db.professionalOpinionVersion.findFirst({
      where: { opportunityId: id, version, assessment: { opportunity: { orgId: ctx.orgId,
        contact: { orgId: ctx.orgId, isAnonymized: false } } } },
      include: { assessment: { select: { opportunity: { select: {
        contact: { select: { name: true } }, posting: { select: { orgId: true, title: true,
          clientCompany: { select: { orgId: true, name: true } } } },
      } } } } },
    }),
    orgOpinionBrand(ctx.orgId),
  ]);
  if (!issued || !brand) return new Response(null, { status: 404 });
  const author = issued.authorId ? await db.user.findFirst({
    where: { orgId: ctx.orgId, id: issued.authorId }, select: { name: true },
  }) : null;
  const { contact, posting } = issued.assessment.opportunity;
  const ownPosting = posting?.orgId === ctx.orgId ? posting : null;
  const content = textRecord(issued.content);
  const bytes = await makeOpinionPdf({ metadata: { candidate: content._candidate ?? contact.name, posting: content._posting ?? ownPosting?.title ?? '',
    client: content._client ?? (ownPosting?.clientCompany?.orgId === ctx.orgId ? ownPosting.clientCompany.name : ''),
    organization: content._organization || brand.name, author: content._author ?? author?.name ?? '' },
    content, issuedAt: issued.issuedAt, version, color: brand.color, logo: brand.logo });
  return pdfResponse(bytes, new URL(request.url).searchParams.has('download'));
}
