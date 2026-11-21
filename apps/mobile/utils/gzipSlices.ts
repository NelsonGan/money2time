/**
 * Gzip and gunzip a slice at a time, yielding to the event loop between
 * slices, so packing a backup or the Web Dashboard's export, or unpacking the
 * cities database, does not freeze the screen. fflate loads on first use.
 */

const GZIP_SLICE_BYTES = 1024 * 1024;
const GUNZIP_SLICE_BYTES = 256 * 1024;

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** The first two bytes of every gzip stream. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gzipInSlices(bytes: Uint8Array): Promise<Uint8Array> {
  const { Gzip } = await import('fflate');
  const chunks: Uint8Array[] = [];
  const stream = new Gzip({ level: 6 }, (chunk) => chunks.push(chunk));
  if (bytes.length === 0) stream.push(bytes, true);
  for (let start = 0; start < bytes.length; start += GZIP_SLICE_BYTES) {
    const end = Math.min(start + GZIP_SLICE_BYTES, bytes.length);
    stream.push(bytes.subarray(start, end), end === bytes.length);
    await nextTick();
  }
  return concat(chunks);
}

export async function gunzipInSlices(compressed: Uint8Array): Promise<Uint8Array> {
  const { Gunzip } = await import('fflate');
  const chunks: Uint8Array[] = [];
  const stream = new Gunzip((chunk) => chunks.push(chunk));
  for (let start = 0; start < compressed.length; start += GUNZIP_SLICE_BYTES) {
    const end = start + GUNZIP_SLICE_BYTES;
    stream.push(compressed.subarray(start, end), end >= compressed.length);
    await nextTick();
  }
  return concat(chunks);
}

/** UTF-8 text to gzip, a slice at a time. */
export async function gzipText(text: string): Promise<Uint8Array> {
  const { strToU8 } = await import('fflate');
  const bytes = strToU8(text);
  await nextTick();
  return gzipInSlices(bytes);
}

/** Gzip to UTF-8 text, a slice at a time. */
export async function gunzipText(compressed: Uint8Array): Promise<string> {
  const { strFromU8 } = await import('fflate');
  const bytes = await gunzipInSlices(compressed);
  await nextTick();
  return strFromU8(bytes);
}
