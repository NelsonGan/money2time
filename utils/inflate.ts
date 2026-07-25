/**
 * Raw DEFLATE (RFC 1951) decompressor, in pure JS with no dependencies.
 *
 * Needed to *read* `.xlsx` files: our own export writes STORED zip entries, but
 * a workbook that has been round-tripped through Excel, Numbers or Sheets comes
 * back deflated. React Native has no `zlib`, so the decoder lives here.
 *
 * Decoding is table-driven: each Huffman tree becomes one flat lookup table
 * indexed by the next `maxBits` stream bits, so a symbol costs a single array
 * read instead of one step per bit. That matters on device, where a
 * bit-at-a-time decoder runs an order of magnitude slower than the sheet sizes
 * a real backup produces can afford.
 *
 * Note that DEFLATE itself carries no checksum. Corrupt input decodes to
 * plausible garbage rather than throwing; integrity is the ZIP layer's job
 * (see the CRC32 check in `xlsxReader`).
 */

const MAX_BITS = 15;

// Length codes 257..285: base length and extra bits (RFC 1951 section 3.2.5).
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

// Distance codes 0..29: base distance and extra bits.
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

// Order in which code-length code lengths appear in a dynamic block header.
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * A decoded Huffman tree. `table` is indexed by the next `maxBits` bits of the
 * stream (LSB-first) and each entry packs `symbol << 4 | codeLength`; a zero
 * entry means no code matches those bits.
 */
interface HuffmanTable {
  table: Int32Array;
  maxBits: number;
}

/** Reverses the low `count` bits of `value` (stream order vs. code order). */
function reverseBits(value: number, count: number): number {
  let reversed = 0;
  for (let i = 0; i < count; i += 1) {
    reversed = (reversed << 1) | ((value >>> i) & 1);
  }
  return reversed;
}

function buildTable(lengths: Uint8Array): HuffmanTable {
  const counts = new Uint16Array(MAX_BITS + 1);
  let maxBits = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i];
    counts[length] += 1;
    if (length > maxBits) maxBits = length;
  }
  counts[0] = 0;
  if (maxBits === 0) {
    return { table: new Int32Array(1), maxBits: 0 };
  }

  // First canonical code of each length.
  const nextCode = new Uint16Array(MAX_BITS + 1);
  let code = 0;
  for (let length = 1; length <= maxBits; length += 1) {
    code = (code + counts[length - 1]) << 1;
    nextCode[length] = code;
  }

  const size = 1 << maxBits;
  const table = new Int32Array(size);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol];
    if (length === 0) continue;
    const reversed = reverseBits(nextCode[length]++, length);
    const entry = (symbol << 4) | length;
    // One code claims every table slot whose low `length` bits match it.
    for (let index = reversed; index < size; index += 1 << length) {
      table[index] = entry;
    }
  }

  return { table, maxBits };
}

let fixedLiteralTable: HuffmanTable | null = null;
let fixedDistanceTable: HuffmanTable | null = null;

function getFixedTables(): { literal: HuffmanTable; distance: HuffmanTable } {
  if (!fixedLiteralTable || !fixedDistanceTable) {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    fixedLiteralTable = buildTable(literalLengths);
    fixedDistanceTable = buildTable(new Uint8Array(30).fill(5));
  }
  return { literal: fixedLiteralTable, distance: fixedDistanceTable };
}

/**
 * Decompresses a raw DEFLATE stream (no zlib or gzip wrapper).
 *
 * @param expectedSize Uncompressed size when known, used to pre-size the output
 *   buffer. Only a hint: the buffer still grows if the stream says otherwise.
 */
export function inflateRaw(data: Uint8Array, expectedSize?: number): Uint8Array {
  let out = new Uint8Array(Math.max(expectedSize ?? data.length * 4, 1024));
  let outLength = 0;
  let position = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  // Tops the bit buffer up to at least 24 bits when input remains. Stops at 31
  // so the accumulator never overflows a 32-bit word.
  const fill = () => {
    while (bitCount <= 23 && position < data.length) {
      bitBuffer |= data[position++] << bitCount;
      bitCount += 8;
    }
  };

  const takeBits = (count: number): number => {
    if (count === 0) return 0;
    fill();
    if (bitCount < count) throw new Error('Unexpected end of compressed data');
    const value = bitBuffer & ((1 << count) - 1);
    bitBuffer >>>= count;
    bitCount -= count;
    return value;
  };

  const decode = (huffman: HuffmanTable): number => {
    fill();
    const entry = huffman.table[bitBuffer & ((1 << huffman.maxBits) - 1)];
    const length = entry & 15;
    if (length === 0 || length > bitCount) {
      throw new Error('Invalid Huffman code in compressed data');
    }
    bitBuffer >>>= length;
    bitCount -= length;
    return entry >>> 4;
  };

  const ensureCapacity = (extra: number) => {
    if (outLength + extra <= out.length) return;
    let nextSize = out.length * 2;
    while (nextSize < outLength + extra) nextSize *= 2;
    const next = new Uint8Array(nextSize);
    next.set(out.subarray(0, outLength));
    out = next;
  };

  for (;;) {
    const isFinal = takeBits(1);
    const blockType = takeBits(2);

    if (blockType === 0) {
      // Stored block: drop to the next byte boundary, rewinding `position` past
      // whatever is still sitting in the bit buffer.
      position -= bitCount >>> 3;
      bitBuffer = 0;
      bitCount = 0;

      if (position + 4 > data.length) throw new Error('Truncated stored block');
      const length = data[position] | (data[position + 1] << 8);
      const negatedLength = data[position + 2] | (data[position + 3] << 8);
      if ((length ^ 0xffff) !== negatedLength) {
        throw new Error('Corrupt stored block header');
      }
      position += 4;
      if (position + length > data.length) throw new Error('Truncated stored block');

      ensureCapacity(length);
      out.set(data.subarray(position, position + length), outLength);
      outLength += length;
      position += length;
    } else if (blockType === 1 || blockType === 2) {
      let literal: HuffmanTable;
      let distance: HuffmanTable;

      if (blockType === 1) {
        ({ literal, distance } = getFixedTables());
      } else {
        const literalCount = takeBits(5) + 257;
        const distanceCount = takeBits(5) + 1;
        const codeLengthCount = takeBits(4) + 4;

        const codeLengthLengths = new Uint8Array(19);
        for (let i = 0; i < codeLengthCount; i += 1) {
          codeLengthLengths[CODE_LENGTH_ORDER[i]] = takeBits(3);
        }
        const codeLengthTable = buildTable(codeLengthLengths);

        const lengths = new Uint8Array(literalCount + distanceCount);
        let index = 0;
        while (index < lengths.length) {
          const symbol = decode(codeLengthTable);
          if (symbol < 16) {
            lengths[index++] = symbol;
          } else if (symbol === 16) {
            if (index === 0) throw new Error('Invalid code-length repeat in compressed data');
            const previous = lengths[index - 1];
            let repeat = 3 + takeBits(2);
            while (repeat-- > 0 && index < lengths.length) lengths[index++] = previous;
          } else if (symbol === 17) {
            index += 3 + takeBits(3);
          } else {
            index += 11 + takeBits(7);
          }
        }

        literal = buildTable(lengths.subarray(0, literalCount));
        distance = buildTable(lengths.subarray(literalCount));
      }

      for (;;) {
        const symbol = decode(literal);
        if (symbol < 256) {
          ensureCapacity(1);
          out[outLength++] = symbol;
          continue;
        }
        if (symbol === 256) break;

        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) {
          throw new Error('Invalid length code in compressed data');
        }
        const copyLength = LENGTH_BASE[lengthIndex] + takeBits(LENGTH_EXTRA[lengthIndex]);

        const distanceSymbol = decode(distance);
        if (distanceSymbol >= DISTANCE_BASE.length) {
          throw new Error('Invalid distance code in compressed data');
        }
        const copyDistance =
          DISTANCE_BASE[distanceSymbol] + takeBits(DISTANCE_EXTRA[distanceSymbol]);
        if (copyDistance > outLength) {
          throw new Error('Invalid back-reference in compressed data');
        }

        // Copied byte by byte on purpose: runs may overlap (distance < length),
        // which is how DEFLATE encodes repeated sequences.
        ensureCapacity(copyLength);
        let from = outLength - copyDistance;
        for (let i = 0; i < copyLength; i += 1) {
          out[outLength++] = out[from++];
        }
      }
    } else {
      throw new Error('Invalid DEFLATE block type');
    }

    if (isFinal) break;
  }

  return out.slice(0, outLength);
}
