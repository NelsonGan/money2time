/**
 * Web / test fallback for imageShrink.native.ts, where there is no image
 * pipeline: picked images are kept as they are and stored ones untouched.
 */
import type { PickedImageKind } from '~/services/imageShrink.shared';

export type { PickedImageKind } from '~/services/imageShrink.shared';

export async function shrinkPickedImage(
  uri: string,
  _kind: PickedImageKind,
  _source?: { width?: number | null; height?: number | null },
): Promise<string> {
  return uri;
}

export async function shrinkStoredPhotos(): Promise<void> {}
