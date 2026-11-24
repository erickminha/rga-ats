'use server';

import { redirect } from 'next/navigation';
import { isSampleSlug } from '@/server/sample-boards';
import { emailPublicOrigin } from '@/lib/base-url';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { after } from 'next/server';
import { submitApplication } from '@/server/applications';
import { kickResumeParse, resumeParsingOn } from '@/server/resume-parse';
import { requestPortalLink } from '@/server/portal';
import { MAX_RESUME_BYTES } from '@/server/resume';
import { RESUME_UPLOAD_FORMATS, sniffFormat } from '@/server/text';
import { EncryptedDocumentError } from '@/server/text/types';

export type ApplyFormState = { error?: string } | undefined;

export async function applyAction(_prev: ApplyFormState, formData: FormData): Promise<ApplyFormState> {
  const orgSlug = String(formData.get('orgSlug') ?? '');
  const postingSlug = String(formData.get('postingSlug') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (isSampleSlug(orgSlug)) return { error: candidate.sampleError };
  if (!name || !email) return { error: candidate.missingIdentity };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: candidate.invalidEmail };

  let resume: { data: Buffer; filename: string } | undefined;
  const file = formData.get('resume');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_RESUME_BYTES) return { error: candidate.largeFile };
    const data = Buffer.from(await file.arrayBuffer());
    // The bytes decide the type: browsers guess MIME types from the extension, or send none.
    const { format, reason } = sniffFormat(data);
    // Office files show it here; a PDF only once it's opened, in submitApplication.
    if (reason === 'encrypted') return { error: candidate.protectedFile };
    // Resume builders and Word's "Web Page" export save HTML under a .doc name.
    if (format === 'html') {
      return { error: candidate.webFile };
    }
    if (!format || !RESUME_UPLOAD_FORMATS.includes(format)) {
      return { error: candidate.badFile };
    }
    resume = { data, filename: file.name };
  }

  try {
    await submitApplication({
      orgSlug,
      postingSlug,
      name,
      email,
      location: String(formData.get('location') ?? '').trim() || undefined,
      linkedin: String(formData.get('linkedin') ?? '').trim() || undefined,
      coverNote: String(formData.get('coverNote') ?? '').trim() || undefined,
      networkOptIn: formData.get('networkOptIn') === 'on',
      storeProfile: formData.get('storeProfile') === 'on',
      resume,
      utm: {
        source: String(formData.get('utm_source') ?? '').trim() || undefined,
        medium: String(formData.get('utm_medium') ?? '').trim() || undefined,
        campaign: String(formData.get('utm_campaign') ?? '').trim() || undefined,
      },
      eeo: formData.has('eeo_gender')
        ? {
            gender: String(formData.get('eeo_gender') ?? 'declined'),
            race: String(formData.get('eeo_race') ?? 'declined'),
            veteran: String(formData.get('eeo_veteran') ?? 'declined'),
            disability: String(formData.get('eeo_disability') ?? 'declined'),
          }
        : undefined,
    });
  } catch (err) {
    if (err instanceof EncryptedDocumentError) return { error: candidate.protectedFile };
    return { error: candidate.applyError };
  }

  // Read the resume once the applicant has their answer (src/server/resume-parse).
  if (resume && resumeParsingOn()) {
    try {
      after(() => kickResumeParse().catch(() => undefined));
    } catch {
      // No request scope to run after: the resume-parse cron picks it up.
    }
  }
  redirect(`/careers/${orgSlug}/${postingSlug}?applied=1`);
}

export async function requestPortalLinkAction(
  _prev: ApplyFormState,
  formData: FormData,
): Promise<ApplyFormState> {
  const orgSlug = String(formData.get('orgSlug') ?? '');
  const email = String(formData.get('email') ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: candidate.invalidEmail };

  const origin = emailPublicOrigin();
  if (!origin) return { error: 'O acompanhamento por e-mail está indisponível no momento. Tente mais tarde.' };
  if (!isSampleSlug(orgSlug)) {
    after(async () => {
      try {
        await requestPortalLink(orgSlug, email, origin);
      } catch {
        console.warn('[candidate-status] Falha ao processar o pedido de acompanhamento.');
      }
    });
  }

  redirect(`/careers/${orgSlug}/status?sent=1`);
}
