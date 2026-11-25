/**
 * How large a receipt image is stored and sent to the scan Worker. Claude
 * bills an image by its pixels (width x height / 750 tokens, no tiles), so
 * every pixel cut from the long edge saves tokens on every scan.
 *
 * Photos of paper receipts keep 1536px on the long edge: small printed text,
 * glare and skew need it. Phone screenshots are crisp rendered text, and they
 * stay fully legible at 1280px: on 18 payment screenshots sent twice through
 * the production scanner (2026-11-25), 1536, 1280 and 1092px read the same
 * amounts, dates, merchants, accounts and categories, while 896px began to
 * drop fields. 1280px billed 2,112 input tokens a scan against 1536px's 2,530,
 * 18% less per screenshot scan, the most common kind of scan.
 */

/** Long-edge cap for photos of receipts (camera, album, Split by Item). */
export const RECEIPT_PHOTO_MAX_EDGE = 1536;

/** Long-edge cap for a phone screenshot sent to a screenshot-mode scan. */
export const SCREENSHOT_MAX_EDGE = 1280;

/**
 * A phone screen is at least this much taller than wide (19.5:9 is 2.17, 20:9
 * is 2.22). A camera photo is 4:3 (1.33) and an iPad screen 4:3 too, so
 * anything flatter than this keeps the photo cap: a photo of a paper receipt
 * shared into the screenshot path still gets the pixels its small text needs.
 */
export const SCREEN_SHAPED_MIN_RATIO = 1.9;

export type ReceiptImageKind = 'photo' | 'screenshot';

/** The long edge (px) to cap a receipt image at before storing and scanning it. */
export function receiptMaxEdge(
  source: { width?: number | null; height?: number | null },
  kind: ReceiptImageKind = 'photo',
): number {
  if (kind !== 'screenshot') return RECEIPT_PHOTO_MAX_EDGE;
  const width = source.width ?? 0;
  const height = source.height ?? 0;
  const short = Math.min(width, height);
  if (short <= 0) return RECEIPT_PHOTO_MAX_EDGE;
  return Math.max(width, height) / short >= SCREEN_SHAPED_MIN_RATIO
    ? SCREENSHOT_MAX_EDGE
    : RECEIPT_PHOTO_MAX_EDGE;
}
