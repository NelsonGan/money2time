import { deflateRawSync } from 'node:zlib';

import { inflateRaw } from '~/utils/inflate';

function roundTrip(input: Buffer, level?: number): Buffer {
  const compressed = deflateRawSync(input, level === undefined ? undefined : { level });
  return Buffer.from(inflateRaw(new Uint8Array(compressed), input.length));
}

describe('inflateRaw', () => {
  it('handles an empty stream', () => {
    expect(roundTrip(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
  });

  it('handles stored (level 0) blocks', () => {
    const input = Buffer.from('the quick brown fox'.repeat(10));
    expect(roundTrip(input, 0)).toEqual(input);
  });

  it('handles fixed-Huffman blocks', () => {
    // Short, low-entropy input is what zlib encodes with the fixed tree.
    const input = Buffer.from('aaaaaaaaab');
    expect(roundTrip(input, 1)).toEqual(input);
  });

  it('handles dynamic-Huffman blocks', () => {
    const input = Buffer.from(
      Array.from({ length: 5000 }, (_, i) => `row ${i} value ${(i * 7919) % 101}\n`).join(''),
    );
    expect(roundTrip(input, 6)).toEqual(input);
  });

  it('resolves overlapping back-references', () => {
    // distance 1, length 999: the classic overlapping run.
    const input = Buffer.from('x'.repeat(1000));
    expect(roundTrip(input)).toEqual(input);
  });

  it('round-trips XML-shaped text at every compression level', () => {
    const input = Buffer.from(
      `<?xml version="1.0"?><sheetData>${Array.from(
        { length: 150 },
        (_, i) => `<row r="${i}"><c r="A${i}" t="inlineStr"><is><t>Café ☕ ${i}</t></is></c></row>`,
      ).join('')}</sheetData>`,
    );
    for (let level = 0; level <= 9; level += 1) {
      expect(roundTrip(input, level)).toEqual(input);
    }
  });

  it('round-trips binary data spanning the full byte range', () => {
    const input = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 31) % 256));
    expect(roundTrip(input, 6)).toEqual(input);
  });

  it('round-trips a stream long enough to need multiple blocks', () => {
    // Well past the ~64KB zlib emits per block, with enough entropy that it
    // cannot collapse into one trivially-compressible run.
    const input = Buffer.from(Array.from({ length: 300_000 }, (_, i) => (i * 31) % 251));
    expect(roundTrip(input, 6)).toEqual(input);
  });

  it('rejects an invalid block type', () => {
    // Block type 3 is reserved: BFINAL=1, BTYPE=11 -> 0b111.
    expect(() => inflateRaw(Uint8Array.from([0b00000111]))).toThrow(/block type/);
  });

  it('rejects a truncated stream', () => {
    const compressed = new Uint8Array(deflateRawSync(Buffer.from('a'.repeat(5000))));
    expect(() => inflateRaw(compressed.slice(0, 8))).toThrow();
  });
});
