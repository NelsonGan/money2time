/** Bound streamed requests even when Content-Length is absent. */
export async function readCreativeRequest(request: Request, limit = 34 * 1024 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Provide creative media.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('Creative media exceeds the request size limit.'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
