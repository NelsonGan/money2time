/**
 * Geometry for framing an uploaded photo inside the card-shaped crop window.
 *
 * The photo is drawn cover-fitted and centred in the frame, then scaled by the
 * user's pinch (`zoom` >= 1) and moved by their drag (`panX`/`panY`, in frame
 * points, of the photo's centre from the frame's centre). The frame must stay
 * covered, so the pan is clamped to the overhang. The functions marked
 * 'worklet' also run on the UI thread inside the gesture handlers.
 */

export interface Size {
  width: number;
  height: number;
}

export interface CardCropPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export const MIN_CARD_CROP_ZOOM = 1;
export const MAX_CARD_CROP_ZOOM = 5;

/** Scale that makes the photo just cover the frame at zoom 1. */
export function coverScale(frame: Size, image: Size): number {
  'worklet';
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(frame.width / image.width, frame.height / image.height);
}

export function clampZoom(zoom: number): number {
  'worklet';
  return Math.min(MAX_CARD_CROP_ZOOM, Math.max(MIN_CARD_CROP_ZOOM, zoom));
}

/** Largest pan, each way, that keeps the frame covered at this zoom. */
export function maxPan(frame: Size, image: Size, zoom: number): { x: number; y: number } {
  'worklet';
  const scale = coverScale(frame, image) * zoom;
  return {
    x: Math.max(0, (image.width * scale - frame.width) / 2),
    y: Math.max(0, (image.height * scale - frame.height) / 2),
  };
}

export function clampPan(value: number, limit: number): number {
  'worklet';
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * The rectangle of the source photo, in its own pixels, that the frame shows.
 * Rounded to whole pixels and kept inside the photo, so it can go straight to
 * the image manipulator's crop.
 */
export function cardCropPixels(
  frame: Size,
  image: Size,
  zoom: number,
  panX: number,
  panY: number,
): CardCropPixels {
  const safeZoom = clampZoom(zoom);
  const limit = maxPan(frame, image, safeZoom);
  const x = clampPan(panX, limit.x);
  const y = clampPan(panY, limit.y);
  const scale = coverScale(frame, image) * safeZoom;
  const width = Math.min(image.width, Math.round(frame.width / scale));
  const height = Math.min(image.height, Math.round(frame.height / scale));
  // The frame's left edge sits (displayed width / 2 - frame width / 2 - pan)
  // points into the displayed photo; divide by the scale for source pixels.
  const rawX = (image.width * scale - frame.width) / 2 - x;
  const rawY = (image.height * scale - frame.height) / 2 - y;
  return {
    originX: Math.min(image.width - width, Math.max(0, Math.round(rawX / scale))),
    originY: Math.min(image.height - height, Math.max(0, Math.round(rawY / scale))),
    width,
    height,
  };
}
