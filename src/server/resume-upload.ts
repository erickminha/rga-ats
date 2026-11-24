import { extractText, FORMAT_EXT, FORMAT_MIME } from '@/server/text';
import { EncryptedDocumentError } from '@/server/text/types';
import { storeFile } from '@/server/storage';

export type ResumeUpload = { data: Buffer; filename: string };

export async function storeExtractedResume(orgId: string, resume: ResumeUpload) {
  const extracted = await extractText({ data: resume.data, source: 'apply', timeoutMs: 5000 });
  if (extracted.status === 'ENCRYPTED') throw new EncryptedDocumentError();
  const { format } = extracted;
  const file = await storeFile({
    orgId,
    filename: format ? (resume.filename.replace(/\.[^.]*$/, '') || 'resume') + FORMAT_EXT[format] : resume.filename,
    mime: format ? FORMAT_MIME[format] : 'application/octet-stream',
    data: resume.data,
  });
  return { file, extracted };
}
