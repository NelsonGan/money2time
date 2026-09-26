// Encode PDF.js image objects as PNG without a native canvas. This is used only
// for password-protected scanned pages; the password stays inside the Worker.

interface PdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array;
}

const MAX_OUTPUT_PIXELS = 4_000_000;

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, payload: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name);
  const body = concat([type, payload]);
  return concat([uint32(payload.length), body, uint32(crc32(body))]);
}

function colorAt(image: PdfImage, x: number, y: number): [number, number, number] {
  const index = y * image.width + x;
  if (image.kind === 1) {
    const stride = Math.ceil(image.width / 8);
    const bit = (image.data[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
    const value = bit ? 255 : 0;
    return [value, value, value];
  }
  if (image.kind === 2) {
    const offset = index * 3;
    return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
  }
  const offset = index * 4;
  const alpha = image.data[offset + 3] / 255;
  return [0, 1, 2].map((channel) =>
    Math.round(image.data[offset + channel] * alpha + 255 * (1 - alpha)),
  ) as [number, number, number];
}

export async function encodePdfImageAsPng(image: PdfImage): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    ![1, 2, 3].includes(image.kind)
  ) {
    throw new Error('unsupported_pdf_image');
  }
  const expectedBytes =
    image.kind === 1
      ? Math.ceil(image.width / 8) * image.height
      : image.width * image.height * (image.kind === 2 ? 3 : 4);
  if (image.data.byteLength < expectedBytes) throw new Error('unsupported_pdf_image');
  const scale = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (image.width * image.height)));
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));
  const rowBytes = width * 3 + 1;
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const rgb = colorAt(image, sourceX, sourceY);
      raw.set(rgb, y * rowBytes + 1 + x * 3);
    }
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header.set([8, 2, 0, 0, 0], 8); // RGB, 8-bit, no interlace
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array()),
  ]);
}

export function base64Bytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
