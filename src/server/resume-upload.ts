import { extractText, FORMAT_EXT, FORMAT_MIME, RESUME_UPLOAD_FORMATS, sniffFormat } from '@/server/text';
import { EncryptedDocumentError } from '@/server/text/types';
import { MAX_RESUME_BYTES } from '@/server/resume';
import { discardUnlinkedFile, storeFile } from '@/server/storage';

export type ResumeUpload = { data: Buffer; filename: string };

export async function storeExtractedResume(orgId: string, resume: ResumeUpload) {
  if (!resume.data.byteLength || resume.data.byteLength > MAX_RESUME_BYTES) throw new Error('Tamanho de currículo inválido.');
  const { format, reason } = sniffFormat(resume.data);
  if (reason === 'encrypted') throw new EncryptedDocumentError();
  if (!format || !RESUME_UPLOAD_FORMATS.includes(format)) throw new Error('Formato de currículo inválido.');
  const file = await storeFile({
    orgId,
    filename: (resume.filename.replace(/\.[^.]*$/, '').slice(0, 180) || 'curriculo') + FORMAT_EXT[format],
    mime: FORMAT_MIME[format],
    data: resume.data,
  }, { staged: true });
  try {
    const extracted = await extractText({ data: resume.data, source: 'apply', timeoutMs: 5000 });
    if (extracted.status === 'ENCRYPTED') throw new EncryptedDocumentError();
    return { file, extracted };
  } catch (error) {
    await discardUnlinkedFile(orgId, file.id).catch(() => undefined);
    throw error;
  }
}
