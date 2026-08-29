/**
 * Minimal, dependency-free `.xlsx` (SpreadsheetML) writer.
 *
 * A `.xlsx` file is a ZIP archive of XML parts. We only ever need to *write*
 * one, and only with plain cells, so the archive is built with STORED (no
 * compression) entries: that removes the need for a deflate implementation and
 * keeps this to pure JS that runs identically on device and under Jest.
 *
 * Everything here is pure (bytes in, bytes out) so the export service can stay
 * a thin file-system/sharing wrapper around it.
 */

/** A date-only cell. Excel renders it with the `yyyy-mm-dd` number format. */
export interface XlsxDateCell {
  kind: 'date';
  /** Day key (`YYYY-MM-DD`) or full ISO timestamp. */
  iso: string;
}

export type XlsxCell = string | number | boolean | null | undefined | XlsxDateCell;

export interface XlsxSheet {
  /** Tab name. Sanitized and de-duplicated against the other sheets. */
  name: string;
  /** Header row, rendered bold and frozen. Omit for a headerless sheet. */
  columns?: string[];
  rows: XlsxCell[][];
}

/** Wraps a day key / ISO timestamp so it lands in Excel as a real date. */
export function xlsxDate(iso: string | null | undefined): XlsxDateCell | null {
  if (!iso) return null;
  return { kind: 'date', iso };
}

function isDateCell(value: XlsxCell): value is XlsxDateCell {
  return typeof value === 'object' && value !== null && (value as XlsxDateCell).kind === 'date';
}

// XML helpers

// XML 1.0 forbids most control characters outright — they can't even be
// escaped as entities, so they're dropped rather than encoded.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnName(index: number): string {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * Excel serial date: whole days since 1899-12-30 (the epoch that reproduces
 * Excel's intentional 1900 leap-year bug for every date after 1900-03-01).
 */
export function excelSerialDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(utcMs)) return null;
  return Math.round((utcMs - Date.UTC(1899, 11, 30)) / 86400000);
}

const INVALID_SHEET_NAME_CHARS = /[[\]:*?/\\]/g;

/** Excel caps tab names at 31 chars, bans a few characters, and needs them unique. */
export function sanitizeSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, index) => {
    const base =
      raw.replace(INVALID_SHEET_NAME_CHARS, ' ').trim().slice(0, 31) || `Sheet${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const tail = ` (${suffix})`;
      candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// Style indices into `xl/styles.xml` cellXfs below.
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

function cellXml(ref: string, value: XlsxCell, styleIndex: number): string {
  const style = styleIndex === STYLE_DEFAULT ? '' : ` s="${styleIndex}"`;

  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"${style}/>`;
  }
  if (isDateCell(value)) {
    const serial = excelSerialDate(value.iso);
    if (serial === null) {
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value.iso)}</t></is></c>`;
    }
    return `<c r="${ref}" s="${STYLE_DATE}"><v>${serial}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return `<c r="${ref}"${style}/>`;
    }
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  }
  // Inline strings keep every sheet self-contained — no sharedStrings part to
  // build, dedupe, or keep in sync.
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function cellTextLength(value: XlsxCell): number {
  if (value === null || value === undefined) return 0;
  if (isDateCell(value)) return 10;
  if (typeof value === 'boolean') return 5;
  return String(value).length;
}

function columnWidthsXml(sheet: XlsxSheet): string {
  const columnCount = Math.max(
    sheet.columns?.length ?? 0,
    ...sheet.rows.map((row) => row.length),
    0,
  );
  if (columnCount === 0) return '';

  const widths: number[] = [];
  for (let col = 0; col < columnCount; col += 1) {
    let longest = sheet.columns?.[col]?.length ?? 0;
    for (const row of sheet.rows) {
      longest = Math.max(longest, cellTextLength(row[col]));
    }
    widths.push(Math.min(60, Math.max(9, longest + 2)));
  }

  const cols = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');
  return `<cols>${cols}</cols>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const hasHeader = !!sheet.columns && sheet.columns.length > 0;
  const parts: string[] = [];
  let rowIndex = 1;

  if (hasHeader) {
    const cells = sheet
      .columns!.map((label, col) => cellXml(`${columnName(col)}${rowIndex}`, label, STYLE_HEADER))
      .join('');
    parts.push(`<row r="${rowIndex}">${cells}</row>`);
    rowIndex += 1;
  }

  for (const row of sheet.rows) {
    const cells = row
      .map((value, col) => cellXml(`${columnName(col)}${rowIndex}`, value, STYLE_DEFAULT))
      .join('');
    parts.push(`<row r="${rowIndex}">${cells}</row>`);
    rowIndex += 1;
  }

  // Freezing the header keeps long transaction exports readable while scrolling.
  const sheetViews = hasHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheetViews}${columnWidthsXml(sheet)}<sheetData>${parts.join('')}</sheetData></worksheet>`;
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

// ZIP container (STORED entries only)

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** UTF-8 encode without depending on a global `TextEncoder`. */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

// Fixed DOS timestamp (1980-01-01 00:00) so the same data always produces the
// same bytes — handy for tests and for diffing two exports.
const DOS_TIME = 0;
const DOS_DATE = 33;

function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8Bytes(entry.path);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 filenames
    localView.setUint16(8, 0, true); // stored
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);

    chunks.push(local, entry.bytes);

    const header = new Uint8Array(46 + nameBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint16(4, 20, true); // version made by
    headerView.setUint16(6, 20, true); // version needed
    headerView.setUint16(8, 0x0800, true);
    headerView.setUint16(10, 0, true);
    headerView.setUint16(12, DOS_TIME, true);
    headerView.setUint16(14, DOS_DATE, true);
    headerView.setUint32(16, crc, true);
    headerView.setUint32(20, size, true);
    headerView.setUint32(24, size, true);
    headerView.setUint16(28, nameBytes.length, true);
    headerView.setUint16(30, 0, true); // extra
    headerView.setUint16(32, 0, true); // comment
    headerView.setUint16(34, 0, true); // disk number
    headerView.setUint16(36, 0, true); // internal attrs
    headerView.setUint32(38, 0, true); // external attrs
    headerView.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);

    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const all = [...chunks, ...central, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

/** Builds a complete `.xlsx` workbook, one worksheet per entry in `sheets`. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }];
  const names = sanitizeSheetNames(safeSheets.map((sheet) => sheet.name));

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    safeSheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names
      .map(
        (name, index) =>
          `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('') +
    '</sheets></workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', bytes: utf8Bytes(contentTypes) },
    { path: '_rels/.rels', bytes: utf8Bytes(rootRels) },
    { path: 'xl/workbook.xml', bytes: utf8Bytes(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', bytes: utf8Bytes(workbookRels) },
    { path: 'xl/styles.xml', bytes: utf8Bytes(STYLES_XML) },
    ...safeSheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      bytes: utf8Bytes(sheetXml(sheet)),
    })),
  ];

  return buildZip(entries);
}
