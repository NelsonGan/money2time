export interface CropSize {
  width: number;
  height: number;
}

export interface CropRect extends CropSize {
  x: number;
  y: number;
}

export interface ReceiptPixelCrop extends CropSize {
  originX: number;
  originY: number;
}

export type CropHandle =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'right'
  | 'bottomRight'
  | 'bottom'
  | 'bottomLeft'
  | 'left';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The exact rectangle an image occupies when rendered with `contentFit="contain"`. */
export function containedImageFrame(container: CropSize, image: CropSize): CropRect | null {
  if (
    !Number.isFinite(container.width) ||
    !Number.isFinite(container.height) ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    container.width <= 0 ||
    container.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return null;
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

/** Resize one edge or corner while keeping the opposite side fixed and the crop valid. */
export function resizeCropRect(
  start: CropRect,
  bounds: CropRect,
  handle: CropHandle,
  translationX: number,
  translationY: number,
  minimumSize: number,
): CropRect {
  const boundsRight = bounds.x + bounds.width;
  const boundsBottom = bounds.y + bounds.height;
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;
  const minWidth = Math.min(Math.max(1, minimumSize), bounds.width);
  const minHeight = Math.min(Math.max(1, minimumSize), bounds.height);

  const movingLeft = handle === 'topLeft' || handle === 'left' || handle === 'bottomLeft';
  const movingRight = handle === 'topRight' || handle === 'right' || handle === 'bottomRight';
  const movingTop = handle === 'topLeft' || handle === 'top' || handle === 'topRight';
  const movingBottom = handle === 'bottomLeft' || handle === 'bottom' || handle === 'bottomRight';

  const left = movingLeft
    ? clamp(start.x + translationX, bounds.x, startRight - minWidth)
    : start.x;
  const right = movingRight
    ? clamp(startRight + translationX, start.x + minWidth, boundsRight)
    : startRight;
  const top = movingTop
    ? clamp(start.y + translationY, bounds.y, startBottom - minHeight)
    : start.y;
  const bottom = movingBottom
    ? clamp(startBottom + translationY, start.y + minHeight, boundsBottom)
    : startBottom;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Move the complete crop rectangle while keeping its size and staying inside the image. */
export function moveCropRect(
  start: CropRect,
  bounds: CropRect,
  translationX: number,
  translationY: number,
): CropRect {
  const maxX = bounds.x + Math.max(0, bounds.width - start.width);
  const maxY = bounds.y + Math.max(0, bounds.height - start.height);
  return {
    x: clamp(start.x + translationX, bounds.x, maxX),
    y: clamp(start.y + translationY, bounds.y, maxY),
    width: start.width,
    height: start.height,
  };
}

/** Convert the on-screen crop rectangle into the source pixels ImageManipulator expects. */
export function cropPixelsFromDisplayRect(
  image: CropSize,
  imageFrame: CropRect,
  crop: CropRect,
): ReceiptPixelCrop {
  const frameRight = imageFrame.x + imageFrame.width;
  const frameBottom = imageFrame.y + imageFrame.height;
  const left = clamp(crop.x, imageFrame.x, frameRight);
  const top = clamp(crop.y, imageFrame.y, frameBottom);
  const right = clamp(crop.x + crop.width, left, frameRight);
  const bottom = clamp(crop.y + crop.height, top, frameBottom);

  const originX = clamp(
    Math.floor(((left - imageFrame.x) / imageFrame.width) * image.width),
    0,
    Math.max(0, image.width - 1),
  );
  const originY = clamp(
    Math.floor(((top - imageFrame.y) / imageFrame.height) * image.height),
    0,
    Math.max(0, image.height - 1),
  );
  const endX = clamp(
    Math.ceil(((right - imageFrame.x) / imageFrame.width) * image.width),
    originX + 1,
    image.width,
  );
  const endY = clamp(
    Math.ceil(((bottom - imageFrame.y) / imageFrame.height) * image.height),
    originY + 1,
    image.height,
  );

  return {
    originX,
    originY,
    width: endX - originX,
    height: endY - originY,
  };
}

/** A small tolerance prevents layout rounding from enabling Crop on an untouched image. */
export function hasCropChanged(crop: CropRect, fullImageFrame: CropRect): boolean {
  const tolerance = 0.5;
  return (
    Math.abs(crop.x - fullImageFrame.x) > tolerance ||
    Math.abs(crop.y - fullImageFrame.y) > tolerance ||
    Math.abs(crop.width - fullImageFrame.width) > tolerance ||
    Math.abs(crop.height - fullImageFrame.height) > tolerance
  );
}
