import DOMMatrix from '@thednp/dommatrix';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// PDF.js references DOMMatrix during module initialization, even for text-only
// extraction. Workers lack the browser global, so initialize it first.
(globalThis as typeof globalThis & { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
const { getDocument, PasswordResponses } = await import('pdfjs-dist/legacy/build/pdf.mjs');

// PDF.js uses a fake worker in the Cloudflare runtime. Give it the bundled
// handler directly so it never tries to fetch a worker script from a URL.
(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfWorker }).pdfjsWorker = pdfWorker;

export class PdfError extends Error {
  constructor(
    public code: 'password_required' | 'incorrect_password' | 'invalid_pdf' | 'too_many_pages',
  ) {
    super(code);
  }
}

export interface PdfContent {
  text: string;
  encrypted: boolean;
  pages: number;
}

const MAX_PAGES = 20;
const MAX_TEXT_CHARS = 120_000;

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
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      lines.push(`\n--- Page ${i} ---\n`);
      lines.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      page.cleanup();
    }
    return {
      text: lines.join('').slice(0, MAX_TEXT_CHARS),
      encrypted: Boolean(password),
      pages: doc.numPages,
    };
  } finally {
    await loading.destroy();
  }
}
