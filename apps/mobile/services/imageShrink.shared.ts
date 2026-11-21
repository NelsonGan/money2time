/**
 * How big the photos the user picks are stored. Pure, unit tested; the native
 * work is in imageShrink.native.ts.
 *
 * Picked photos used to be stored at full size and JPEG quality 0.9: an album
 * cover was 400–800 KB, and every backup carried each one. Each kind now has a
 * long-edge cap and a quality that still look sharp where it is shown. Receipts
 * have their own pipeline (receiptImage.native.ts) and card designs their crop
 * step (CardDesignCropModal), so neither is handled here.
 */

export type PickedImageKind = 'cover' | 'avatar' | 'qr' | 'icon';

export interface ImageLimit {
  /** Longest edge, in pixels; never upscaled. */
  maxEdge: number;
  /** JPEG quality (0–1). */
  compress: number;
  /** A stored file above this many bytes is worth re-encoding. */
  shrinkAboveBytes: number;
}

export const IMAGE_LIMITS: Record<PickedImageKind, ImageLimit> = {
  // Album and goal covers: a full-width photo on a phone.
  cover: { maxEdge: 1280, compress: 0.7, shrinkAboveBytes: 300_000 },
  // Avatars are never drawn wider than about 120 points.
  avatar: { maxEdge: 512, compress: 0.8, shrinkAboveBytes: 120_000 },
  // A payment QR has to stay sharp enough to scan from another phone.
  qr: { maxEdge: 1024, compress: 0.85, shrinkAboveBytes: 300_000 },
  // Logos and icons are drawn small; a PNG stays PNG to keep its transparency.
  icon: { maxEdge: 512, compress: 0.85, shrinkAboveBytes: 150_000 },
};

/** The kind each user-assets folder holds, for the stored-photo pass. */
const KIND_BY_FOLDER: Record<string, PickedImageKind> = {
  'album-covers': 'cover',
  'goal-covers': 'cover',
  avatars: 'avatar',
  'payment-qr': 'qr',
  'account-logos': 'icon',
  'subscription-logos': 'icon',
  'item-icons': 'icon',
  'category-icons': 'icon',
};

export function storedImageKind(path: string): PickedImageKind | null {
  const folder = path.split('/')[0];
  return KIND_BY_FOLDER[folder] ?? null;
}

export function imageExtension(uriOrPath: string): string {
  const raw = uriOrPath.split('?')[0].split('#')[0];
  const name = raw.slice(raw.lastIndexOf('/') + 1);
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
}

/** The resize that brings the long edge down to `maxEdge`, or null if it fits. */
export function resizeFor(
  width: number,
  height: number,
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (!(width > 0 && height > 0) || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/** Whether a picked image of this kind is saved as PNG (an icon that was one). */
export function savesAsPng(kind: PickedImageKind, sourceUri: string): boolean {
  return kind === 'icon' && imageExtension(sourceUri) === 'png';
}

/**
 * Sizes a stored file had after a pass could not bring it under its kind's
 * limit, by path, so later passes skip it while it stays that size.
 */
export type StoredImageMemo = Record<string, number>;

/**
 * Whether the stored-photo pass should re-encode this file: a JPEG or PNG of a
 * known kind, over its kind's size, and not already tried at this size. Other
 * formats are left as they are, since the path (and so its extension) must not
 * change.
 */
export function shouldShrinkStored(path: string, size: number, memo: StoredImageMemo): boolean {
  const kind = storedImageKind(path);
  if (!kind) return false;
  if (!['jpg', 'jpeg', 'png'].includes(imageExtension(path))) return false;
  if (size <= IMAGE_LIMITS[kind].shrinkAboveBytes) return false;
  return memo[path] !== size;
}
