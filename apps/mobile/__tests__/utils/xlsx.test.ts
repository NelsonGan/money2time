import { inflateSync } from 'node:zlib';

import {
  buildXlsx,
  columnName,
  crc32,
  escapeXml,
  excelSerialDate,
  sanitizeSheetNames,
  utf8Bytes,
  xlsxDate,
} from '~/utils/xlsx';

/**
 * Minimal ZIP reader for the assertions below: walks the local file headers of
 * the archive we just wrote and returns { path: text } for every entry.
 * Doubles as a structural check that the headers we emit are self-consistent.
 */
function readZipEntries(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Record<string, string> = {};
  let offset = 0;

  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = Buffer.from(bytes.slice(nameStart, nameStart + nameLength)).toString('utf8');
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    entries[name] = Buffer.from(method === 0 ? data : inflateSync(Buffer.from(data))).toString(
      'utf8',
    );
    offset = dataStart + compressedSize;
  }

  return entries;
}

describe('columnName', () => {
  it('maps indices to spreadsheet column letters', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(51)).toBe('AZ');
    expect(columnName(701)).toBe('ZZ');
    expect(columnName(702)).toBe('AAA');
  });
});

describe('excelSerialDate', () => {
  it('uses the 1899-12-30 epoch Excel expects', () => {
    expect(excelSerialDate('1900-01-01')).toBe(2);
    expect(excelSerialDate('2024-01-01')).toBe(45292);
    expect(excelSerialDate('2026-07-25')).toBe(46228);
  });

  it('accepts a full ISO timestamp and ignores the time part', () => {
    expect(excelSerialDate('2024-01-01T23:59:00.000Z')).toBe(excelSerialDate('2024-01-01'));
  });

  it('returns null for anything that is not a date', () => {
    expect(excelSerialDate('not a date')).toBeNull();
    expect(excelSerialDate('')).toBeNull();
  });
});

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  it('drops control characters XML cannot represent', () => {
    expect(escapeXml('a\u0000b\u001Fc')).toBe('abc');
  });

  it('keeps tab, newline and carriage return', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

describe('sanitizeSheetNames', () => {
  it('strips characters Excel rejects in a tab name', () => {
    expect(sanitizeSheetNames(['a/b:c*d?e[f]g'])).toEqual(['a b c d e f g']);
  });

  it('caps names at 31 characters', () => {
    expect(sanitizeSheetNames(['x'.repeat(40)])[0]).toHaveLength(31);
  });

  it('de-duplicates names case-insensitively', () => {
    expect(sanitizeSheetNames(['Data', 'data', 'DATA'])).toEqual(['Data', 'data (2)', 'DATA (3)']);
  });

  it('falls back to a generated name when nothing survives', () => {
    expect(sanitizeSheetNames(['///'])).toEqual(['Sheet1']);
  });
});

describe('crc32 / utf8Bytes', () => {
  it('matches the known CRC32 of "123456789"', () => {
    expect(crc32(utf8Bytes('123456789'))).toBe(0xcbf43926);
  });

  it('encodes multi-byte and astral characters', () => {
    expect(Array.from(utf8Bytes('é'))).toEqual([0xc3, 0xa9]);
    expect(Array.from(utf8Bytes('中'))).toEqual([0xe4, 0xb8, 0xad]);
    expect(Array.from(utf8Bytes('😀'))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
});

describe('buildXlsx', () => {
  const workbook = buildXlsx([
    {
      name: 'Transactions',
      columns: ['Date', 'Note', 'Amount'],
      rows: [
        [xlsxDate('2024-03-05'), 'Coffee & cake', 4.5],
        [null, '', 0],
        [xlsxDate(null), 'Flagged', true],
      ],
    },
    { name: 'Accounts', columns: ['Name'], rows: [['Cash']] },
  ]);
  const entries = readZipEntries(workbook);

  it('produces a ZIP container', () => {
    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // End-of-central-directory signature closes the archive.
    expect(Array.from(workbook.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it('writes every part an xlsx reader needs', () => {
    expect(Object.keys(entries).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('names one sheet per input and relates it to its worksheet part', () => {
    expect(entries['xl/workbook.xml']).toContain(
      '<sheet name="Transactions" sheetId="1" r:id="rId1"/>',
    );
    expect(entries['xl/workbook.xml']).toContain(
      '<sheet name="Accounts" sheetId="2" r:id="rId2"/>',
    );
    expect(entries['xl/_rels/workbook.xml.rels']).toContain(
      'Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"',
    );
    // Styles take the relationship id after the last worksheet.
    expect(entries['xl/_rels/workbook.xml.rels']).toContain('Id="rId3"');
    expect(entries['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
  });

  it('writes the header row bold and freezes it', () => {
    const sheet = entries['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain(
      '<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Date</t></is></c>',
    );
    expect(sheet).toContain('state="frozen"');
  });

  it('writes dates as styled serial numbers', () => {
    expect(entries['xl/worksheets/sheet1.xml']).toContain(
      `<c r="A2" s="2"><v>${excelSerialDate('2024-03-05')}</v></c>`,
    );
  });

  it('escapes strings, writes numbers bare, and writes booleans as b-cells', () => {
    const sheet = entries['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('Coffee &amp; cake');
    expect(sheet).toContain('<c r="C2"><v>4.5</v></c>');
    expect(sheet).toContain('<c r="C4" t="b"><v>1</v></c>');
  });

  it('writes empty cells for null and empty-string values', () => {
    const sheet = entries['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A3"/>');
    expect(sheet).toContain('<c r="B3"/>');
    // Zero is a real value, not an empty cell.
    expect(sheet).toContain('<c r="C3"><v>0</v></c>');
  });

  it('always emits at least one worksheet', () => {
    const empty = readZipEntries(buildXlsx([]));
    expect(empty['xl/worksheets/sheet1.xml']).toContain('<sheetData></sheetData>');
  });

  it('is deterministic for the same input', () => {
    const again = buildXlsx([{ name: 'Accounts', columns: ['Name'], rows: [['Cash']] }]);
    const twice = buildXlsx([{ name: 'Accounts', columns: ['Name'], rows: [['Cash']] }]);
    expect(Buffer.from(again).equals(Buffer.from(twice))).toBe(true);
  });
});
