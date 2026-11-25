import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import { db } from '@/lib/db';
import { readBrand } from '@/lib/brand';
import { appLocale } from '@/lib/i18n';
import { opinionFields, textRecord } from '@/lib/i18n/pt-BR/assessment';
import { opinionKeys, type OpinionMetadata } from '@/lib/professional-opinion';
import { readStoredFile } from '@/server/storage';

export async function makeOpinionPdf({
  metadata, content, issuedAt, version, color, logo, draft = false,
}: {
  metadata: OpinionMetadata; content: Record<string, string>; issuedAt: Date; version: number;
  draft?: boolean; color?: string | null; logo?: { bytes: Uint8Array; mime: string };
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Parecer de Candidato');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(normal.getCharacterSet());
  const supported = (text: string) => Array.from(text.normalize('NFC')).map((letter) => {
    if (letter === '\n') return letter;
    if (letter === '\t' || letter === '\r') return ' ';
    return charset.has(letter.codePointAt(0) ?? 0) ? letter : '?';
  }).join('');
  const brand = /^#[a-f\d]{6}$/i.test(color ?? '') ? color! : '#1581c9';
  const accent = rgb(...([1, 3, 5].map((offset) => parseInt(brand.slice(offset, offset + 2), 16) / 255) as [number, number, number]));
  const ink = rgb(0.10, 0.16, 0.23);
  const x = 48;
  const [width, height] = PageSizes.A4;
  const available = width - 2 * x;
  let page = pdf.addPage(PageSizes.A4);
  let y = height - 56;

  if (logo) {
    try {
      const img = logo.mime === 'image/png' ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
      const fitted = img.scale(Math.min(150 / img.width, 52 / img.height, 1));
      page.drawImage(img, { x, y: y - fitted.height, ...fitted });
      y -= fitted.height + 18;
    } catch { /* the organization name still identifies the issuer when a logo is invalid */ }
  }

  function nextPage() {
    page = pdf.addPage(PageSizes.A4);
    page.drawRectangle({ x, y: height - 49, width: available, height: 2, color: accent });
    y = height - 68;
  }

  function line(value: string, font = normal, size = 11) {
    if (y < 57) nextPage();
    page.drawText(value, { x, y, size, font, color: ink });
    y -= size + 5;
  }

  function paragraph(value: string, font = normal, size = 11) {
    for (const part of supported(value).split('\n')) {
      let current = '';
      for (const word of part.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(current ? current + ' ' + word : word, size) > available && current) {
          line(current, font, size);
          current = '';
        }
        if (font.widthOfTextAtSize(word, size) <= available) {
          current = current ? current + ' ' + word : word;
          continue;
        }
        for (const letter of word) {
          if (font.widthOfTextAtSize(current + letter, size) > available) {
            line(current, font, size);
            current = '';
          }
          current += letter;
        }
      }
      line(current, font, size);
    }
  }

  paragraph(metadata.organization, bold, 12);
  paragraph(draft ? 'Parecer de Candidato — RASCUNHO' : 'Parecer de Candidato', bold, 23);
  page.drawRectangle({ x, y, width: available, height: 3, color: accent });
  y -= 23;
  const headers = [
    ['Profissional', metadata.candidate], ['Vaga', metadata.posting], ['Empresa cliente', metadata.client],
    ['Responsável', metadata.author], ['Emissão', issuedAt.toLocaleDateString(appLocale, { timeZone: 'America/Sao_Paulo' })], ['Versão', draft ? 'Prévia não emitida' : String(version)],
  ];
  for (const [label, value] of headers) if (value) paragraph(label + ': ' + value);
  y -= 12;
  for (const key of opinionKeys) {
    if (!content[key]) continue;
    if (y < 95) nextPage();
    paragraph(opinionFields[key], bold, 12);
    const [firstLine, ...remaining] = content[key].split('\n');
    const ranks = key === 'behavior' && /^D (\d+) · I (\d+) · S (\d+) · C (\d+)$/.exec(firstLine);
    const values = ranks ? ranks.slice(1).map(Number) : [];
    if (values.length === 4 && values.every(value => value >= 10 && value <= 40) &&
      values.reduce((sum, value) => sum + value, 0) === 100) {
      if (y < 145) nextPage();
      const colors = [rgb(.71,.14,.09), rgb(.98,.78,.17), rgb(.14,.45,.30), rgb(.07,.43,.66)];
      values.forEach((value, index) => {
        page.drawRectangle({ x: x + 60, y: y + 1, width: value / 40 * (available - 60), height: 8, color: colors[index] });
        line('DISC'[index] + ' ' + value, bold, 10);
      });
      if (remaining.length) paragraph(remaining.join('\n'));
    } else paragraph(content[key]);
    y -= 9;
  }
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    const footer = supported((draft ? 'RASCUNHO · ' : '') + metadata.organization).slice(0, 78);
    sheet.drawText(footer, { x, y: 27, font: normal, size: 8, color: ink });
    sheet.drawText(`${index + 1} / ${pages.length}`, { x: width - 86, y: 27, font: normal, size: 8, color: ink });
  });
  return pdf.save();
}

export async function orgOpinionBrand(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, brand: true, logoFile: true } });
  if (!org) return null;
  const file = org.logoFile;
  const mime = file?.mime ?? '';
  const bytes = file?.orgId === orgId && !file.deletePendingAt && file.size <= 3_000_000 && ['image/png', 'image/jpeg'].includes(mime)
    ? await readStoredFile(file.key).catch(() => undefined) : undefined;
  return { name: org.name, color: readBrand(org.brand).color, logo: bytes ? { bytes, mime } : undefined };
}

export function pdfResponse(bytes: Uint8Array, download = false) {
  return new Response(Buffer.from(bytes), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="parecer-profissional.pdf"',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  } });
}

export { textRecord };
