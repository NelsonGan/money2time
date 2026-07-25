import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildXlsx, columnName, xlsxDate } from '~/utils/xlsx';
import {
  columnIndexFromRef,
  dayKeyFromExcelSerial,
  decodeXmlText,
  readXlsx,
} from '~/utils/xlsxReader';

describe('columnIndexFromRef', () => {
  it('inverts the writer’s column naming', () => {
    for (const index of [0, 1, 25, 26, 51, 701, 702]) {
      expect(columnIndexFromRef(`${columnName(index)}12`)).toBe(index);
    }
  });
});

describe('dayKeyFromExcelSerial', () => {
  it('inverts the writer’s serial dates', () => {
    expect(dayKeyFromExcelSerial(45292)).toBe('2024-01-01');
    expect(dayKeyFromExcelSerial(2)).toBe('1900-01-01');
  });

  it('drops the fractional time part', () => {
    expect(dayKeyFromExcelSerial(45292.75)).toBe('2024-01-01');
  });
});

describe('decodeXmlText', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(
      `a & b <c> "d" 'e'`,
    );
    expect(decodeXmlText('&#65;&#x42;&#128512;')).toBe('AB😀');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeXmlText('&nbsp;x')).toBe('&nbsp;x');
  });
});

describe('readXlsx', () => {
  it('round-trips a workbook written by buildXlsx', () => {
    const bytes = buildXlsx([
      {
        name: 'Transactions',
        columns: ['Date', 'Type', 'Amount', 'Note', 'Flagged'],
        rows: [
          [xlsxDate('2024-03-05'), 'expense', 4.5, 'Coffee & cake <hot>', true],
          [xlsxDate('2024-03-06'), 'income', 1200, '日本語 / émoji 😀', false],
          [null, 'transfer', 0, '', null],
        ],
      },
      { name: 'Accounts', columns: ['Name', 'Currency'], rows: [['Cash', 'MYR']] },
    ]);

    const workbook = readXlsx(bytes);

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['Transactions', 'Accounts']);
    expect(workbook.sheets[0].rows).toEqual([
      ['Date', 'Type', 'Amount', 'Note', 'Flagged'],
      ['2024-03-05', 'expense', 4.5, 'Coffee & cake <hot>', true],
      ['2024-03-06', 'income', 1200, '日本語 / émoji 😀', false],
      [null, 'transfer', 0, null, null],
    ]);
    expect(workbook.sheets[1].rows).toEqual([
      ['Name', 'Currency'],
      ['Cash', 'MYR'],
    ]);
  });

  it('handles a workbook with no data rows', () => {
    const workbook = readXlsx(buildXlsx([{ name: 'Empty', columns: ['A', 'B'], rows: [] }]));
    expect(workbook.sheets[0].rows).toEqual([['A', 'B']]);
  });

  it('rejects a file that is not a zip', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/valid zip/);
  });

  it('detects a corrupted entry via its CRC', () => {
    const corrupted = buildXlsx([{ name: 'Sheet1', columns: ['A'], rows: [['x']] }]).slice();
    // Flip a byte inside the first entry's payload.
    corrupted[80] ^= 0xff;
    expect(() => readXlsx(corrupted)).toThrow(/Checksum mismatch/);
  });
});

/**
 * The round-trip tests above only prove the reader understands our own writer.
 * This fixture is the shape real spreadsheet apps emit and our writer never
 * does: DEFLATE-compressed parts, a sharedStrings table (including a rich-text
 * run and a phonetic guide), a built-in date numFmt reached through cellXfs,
 * a skipped row, and an error cell.
 */
describe('readXlsx on a real-world workbook', () => {
  const bytes = new Uint8Array(
    readFileSync(join(__dirname, '..', 'fixtures', 'excel-shared-strings.xlsx')),
  );

  it('resolves shared strings, dates and sparse rows', () => {
    const workbook = readXlsx(bytes);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['Transactions']);
    expect(workbook.sheets[0].rows).toEqual([
      ['Date', 'Type', 'Note'],
      // Style 1 -> built-in numFmtId 14, so the serial becomes a day key.
      ['2024-03-05', 'expense', 'Coffee & cake'],
      // Rich-text runs concatenate; the phonetic guide is dropped.
      ['2024-03-06', 'expense', '東京'],
    ]);
    // Row 4 is missing from the XML and row 5 holds only a #REF! error, so both
    // trim away rather than becoming phantom rows the importer would skip.
  });
});
