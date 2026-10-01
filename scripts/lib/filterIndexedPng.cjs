const { Buffer } = require('node:buffer');
const zlib = require('node:zlib');
const { crc32 } = require('pngjs/lib/crc');

// The existing logo/tutorial encoder writes 8-bit palette indices with None
// filtering. Sub/Up prediction can compress those bytes without changing the
// palette, transparency, metadata, or even one decoded pixel.
function filterIndexedPng(input) {
  if (input[24] !== 8 || input[25] !== 3 || input[28] !== 0) return input;
  const width = input.readUInt32BE(16);
  const height = input.readUInt32BE(20);
  const chunks = [];
  const compressed = [];
  for (let offset = 8; offset < input.length; ) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, bytes: input.subarray(offset, offset + length + 12) });
    if (type === 'IDAT') compressed.push(input.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width + 1;
  if (raw.length !== stride * height) return input;
  for (let row = 0; row < height; row += 1) {
    if (raw[row * stride] !== 0) return input;
  }

  const filtered = Buffer.alloc(raw.length);
  for (let row = 0; row < height; row += 1) {
    const offset = row * stride;
    let bestScore = Infinity;
    for (const filter of [0, 1, 2]) {
      const candidate = Buffer.alloc(stride);
      candidate[0] = filter;
      let score = 0;
      for (let column = 1; column <= width; column += 1) {
        const prediction =
          filter === 1 && column > 1
            ? raw[offset + column - 1]
            : filter === 2 && row > 0
              ? raw[offset + column - stride]
              : 0;
        const value = (raw[offset + column] - prediction) & 255;
        candidate[column] = value;
        score += Math.min(value, 256 - value);
      }
      if (score < bestScore) {
        bestScore = score;
        candidate.copy(filtered, offset);
      }
    }
  }

  const payload = zlib.deflateSync(filtered, { level: 9 });
  const replacement = Buffer.alloc(payload.length + 12);
  replacement.writeUInt32BE(payload.length, 0);
  replacement.write('IDAT', 4, 'ascii');
  payload.copy(replacement, 8);
  replacement.writeUInt32BE(crc32(replacement.subarray(4, -4)) >>> 0, replacement.length - 4);
  let replaced = false;
  return Buffer.concat([
    input.subarray(0, 8),
    ...chunks.flatMap((chunk) => {
      if (chunk.type !== 'IDAT') return [chunk.bytes];
      if (replaced) return [];
      replaced = true;
      return [replacement];
    }),
  ]);
}

module.exports = { filterIndexedPng };
