import DOMMatrix from '@thednp/dommatrix';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { base64Bytes, encodePdfImageAsPng } from './png';

// PDF.js references DOMMatrix during module initialization, even for text-only
// extraction. Workers lack the browser global, so initialize it first.
(globalThis as typeof globalThis & { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
const { getDocument, PasswordResponses, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');

// PDF.js uses a fake worker in the Cloudflare runtime. Give it the bundled
// handler directly so it never tries to fetch a worker script from a URL.
(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfWorker }).pdfjsWorker = pdfWorker;

export class PdfError extends Error {
  constructor(
    public code:
      | 'password_required'
      | 'incorrect_password'
      | 'invalid_pdf'
      | 'too_many_pages'
      | 'encrypted_scan_unreadable',
  ) {
    super(code);
  }
}

export interface PdfContent {
  text: string;
  encrypted: boolean;
  pages: number;
  images: { page: number; pngBase64: string }[];
}

const MAX_PAGES = 20;
const MAX_TEXT_CHARS = 120_000;
const MAX_IMAGE_BASE64_CHARS = 16_000_000;

export async function extractPdfContent(bytes: Uint8Array, password?: string): Promise<PdfContent> {
  const loading = getDocument({
    data: bytes,
    password: password || undefined,
    useSystemFonts: false,
    disableFontFace: true,
  });

  let doc;
  try {
    doc = await loading.promise;
  } catch (error) {
    const reason = (error as { code?: number }).code;
    if (reason === PasswordResponses.NEED_PASSWORD) throw new PdfError('password_required');
    if (reason === PasswordResponses.INCORRECT_PASSWORD) {
      throw new PdfError(password ? 'incorrect_password' : 'password_required');
    }
    throw new PdfError('invalid_pdf');
  }

  try {
    if (doc.numPages > MAX_PAGES) throw new PdfError('too_many_pages');
    const lines: string[] = [];
    const pageTextLengths: number[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      pageTextLengths.push(pageText.length);
      if (pageText) lines.push(`\n--- Page ${i} ---\n${pageText}`);
      page.cleanup();
    }
    const text = lines.join('').slice(0, MAX_TEXT_CHARS);
    const images: PdfContent['images'] = [];
    // A locked, image-only statement cannot go through the PDF file parser,
    // which would receive the still-encrypted original file. Decode its page
    // images here and send only the unlocked pixels to the model.
    if (password && pageTextLengths.some((length) => length < 100)) {
      let encodedSize = 0;
      for (let i = 1; i <= doc.numPages; i += 1) {
        if (pageTextLengths[i - 1] >= 100) continue;
        const page = await doc.getPage(i);
        const operators = await page.getOperatorList();
        let largest: { id: string; area: number } | null = null;
        for (let index = 0; index < operators.fnArray.length; index += 1) {
          if (operators.fnArray[index] !== OPS.paintImageXObject) continue;
          const [id, width, height] = operators.argsArray[index] as [string, number, number];
          const area = width * height;
          if (typeof id === 'string' && area >= 100_000 && (!largest || area > largest.area)) {
            largest = { id, area };
          }
        }
        if (largest) {
          const image = await new Promise<{
            width: number;
            height: number;
            kind: number;
            data: Uint8Array;
          }>((resolve) => page.objs.get(largest.id, resolve));
          const pngBase64 = base64Bytes(await encodePdfImageAsPng(image));
          encodedSize += pngBase64.length;
          if (encodedSize > MAX_IMAGE_BASE64_CHARS) throw new PdfError('encrypted_scan_unreadable');
          images.push({ page: i, pngBase64 });
        } else if (pageTextLengths[i - 1] === 0) {
          throw new PdfError('encrypted_scan_unreadable');
        }
        page.cleanup();
      }
    }
    return {
      text,
      encrypted: Boolean(password),
      pages: doc.numPages,
      images,
    };
  } finally {
    await loading.destroy();
  }
}
