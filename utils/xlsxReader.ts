/**
 * Minimal, dependency-free `.xlsx` reader: the counterpart to `~/utils/xlsx`.
 *
 * Reads the ZIP container (STORED and DEFLATE entries), resolves shared
 * strings, and works out which cells are dates from the style table, producing
 * a plain `string | number | boolean | null` grid per sheet. Deliberately does
 * not model formulas, merges, or formatting beyond what the importer needs.
 *
 * XML is parsed with regexes rather than a DOM. That is a real constraint, not
 * an oversight: the parts we read are machine-generated and shallow, and React
 * Native has no XML parser to lean on.
 */

import { crc32 } from '~/utils/xlsx';
import { inflateRaw } from '~/utils/inflate';

/** Values a cell can carry. Dates arrive as `YYYY-MM-DD` day keys. */
export type XlsxReadCell = string | number | boolean | null;

export interface XlsxReadSheet {
  name: string;
  /** Row-major grid. Trailing empty rows and cells are trimmed away. */
  rows: XlsxReadCell[][];
}

export interface XlsxWorkbook {
  sheets: XlsxReadSheet[];
}

// ---------------------------------------------------------------------------
// ZIP container
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(view: DataView, size: number): number {
  // The EOCD is last, but a trailing comment can push it back up to 64KB.
  const earliest = Math.max(0, size - 0xffff - 22);
  for (let offset = size - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function utf8Decode(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i++];
    let codePoint: number;
    if (byte < 0x80) {
      codePoint = byte;
    } else if (byte < 0xe0) {
      codePoint = ((byte & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (byte < 0xf0) {
      codePoint = ((byte & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      codePoint =
        ((byte & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    if (codePoint > 0xffff) {
      const adjusted = codePoint - 0x10000;
      result += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
    } else {
      result += String.fromCharCode(codePoint);
    }
  }
  return result;
}

/**
 * Reads every entry of a ZIP archive as text, keyed by path.
 *
 * Walks the central directory rather than the local headers, because a writer
 * that streams entries leaves the local header's sizes zeroed and defers them
 * to a trailing data descriptor. The central directory always has real values.
 */
export function readZipTextEntries(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view, bytes.length);
  if (eocd < 0) throw new Error('Not a valid zip archive');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: Record<string, string> = {};

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Corrupt zip central directory');
    }
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = utf8Decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error('Corrupt zip entry header');
    }
    // The local header's own name/extra lengths are authoritative for locating
    // the payload; the central copy of `extra` is often a different length.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    let content: Uint8Array;
    if (method === 0) {
      content = raw;
    } else if (method === 8) {
      content = inflateRaw(raw, uncompressedSize);
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`);
    }

    // DEFLATE carries no checksum of its own, so this is the only place a
    // corrupted archive gets caught before we start trusting its contents.
    if (crc32(content) !== expectedCrc) {
      throw new Error(`Checksum mismatch for "${path}" (file may be corrupt)`);
    }

    entries[path] = utf8Decode(content);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match ? decodeXmlText(match[1]) : null;
}

/** Concatenates every `<t>` run inside a fragment, skipping phonetic guides. */
function collectTextRuns(fragment: string): string {
  const withoutPhonetics = fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
  let text = '';
  const pattern = /<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutPhonetics)) !== null) {
    text += decodeXmlText(match[1] ?? '');
  }
  return text;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const pattern = /<si(?:\s[^>]*)?\/>|<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    strings.push(match[1] === undefined ? '' : collectTextRuns(match[1]));
  }
  return strings;
}

// Built-in number formats that denote a date or time (ECMA-376 section 18.8.30).
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/\[[^\]]*\]/g, '') // colour / condition / locale blocks
    .replace(/"[^"]*"/g, '') // quoted literals
    .replace(/\\./g, ''); // escaped single characters
  return /[ymdhs]/i.test(stripped);
}

/** Style indices (`s` on a cell) whose number format renders as a date. */
function parseDateStyles(xml: string | undefined): Set<number> {
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;

  const customDateFormatIds = new Set<number>();
  const numFmtPattern = /<numFmt\s[^>]*\/>/g;
  let numFmtMatch: RegExpExecArray | null;
  while ((numFmtMatch = numFmtPattern.exec(xml)) !== null) {
    const id = Number(attribute(numFmtMatch[0], 'numFmtId'));
    const code = attribute(numFmtMatch[0], 'formatCode');
    if (Number.isFinite(id) && code && isDateFormatCode(code)) {
      customDateFormatIds.add(id);
    }
  }

  const cellXfsBlock = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(xml)?.[0];
  if (!cellXfsBlock) return dateStyles;

  const xfPattern = /<xf\s[^>]*?\/>|<xf\s[^>]*?>[\s\S]*?<\/xf>/g;
  let styleIndex = 0;
  let xfMatch: RegExpExecArray | null;
  while ((xfMatch = xfPattern.exec(cellXfsBlock)) !== null) {
    const id = Number(attribute(xfMatch[0], 'numFmtId') ?? '0');
    if (BUILTIN_DATE_FORMAT_IDS.has(id) || customDateFormatIds.has(id)) {
      dateStyles.add(styleIndex);
    }
    styleIndex += 1;
  }

  return dateStyles;
}

/** "BC12" -> 54 (zero-based column index). */
export function columnIndexFromRef(ref: string): number {
  let index = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Inverse of the writer's serial-date encoding, back to a `YYYY-MM-DD` key. */
export function dayKeyFromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  // Excel's epoch is 1899-12-30; fractional part is the time of day, dropped.
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseSheet(
  xml: string,
  sharedStrings: string[],
  dateStyles: Set<number>,
): XlsxReadCell[][] {
  const rows: XlsxReadCell[][] = [];
  const sheetData = /<sheetData(?:\s[^>]*)?>([\s\S]*)<\/sheetData>/.exec(xml)?.[1];
  if (!sheetData) return rows;

  const rowPattern = /<row(?:\s[^>]*)?\/>|<row(\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let nextRowIndex = 0;

  while ((rowMatch = rowPattern.exec(sheetData)) !== null) {
    const rowAttrs = rowMatch[1] ?? '';
    const rowBody = rowMatch[2] ?? '';
    // `r` is one-based and may skip blank rows; honour it when present.
    const declaredRow = Number(attribute(rowAttrs, 'r'));
    const rowIndex =
      Number.isFinite(declaredRow) && declaredRow > 0 ? declaredRow - 1 : nextRowIndex;
    nextRowIndex = rowIndex + 1;

    const cells: XlsxReadCell[] = [];
    const cellPattern = /<c(\s[^>]*)?\/>|<c(\s[^>]*)?>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let nextColumnIndex = 0;

    while ((cellMatch = cellPattern.exec(rowBody)) !== null) {
      const cellAttrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const cellBody = cellMatch[3] ?? '';
      const ref = attribute(cellAttrs, 'r');
      const columnIndex = ref ? columnIndexFromRef(ref) : nextColumnIndex;
      nextColumnIndex = columnIndex + 1;

      const type = attribute(cellAttrs, 't') ?? 'n';
      const styleIndex = Number(attribute(cellAttrs, 's') ?? '0');
      const rawValue = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellBody)?.[1];

      let value: XlsxReadCell = null;
      if (type === 's') {
        const stringIndex = Number(rawValue);
        value = Number.isFinite(stringIndex) ? (sharedStrings[stringIndex] ?? null) : null;
      } else if (type === 'inlineStr') {
        value = collectTextRuns(cellBody);
      } else if (type === 'str') {
        // Cached result of a formula.
        value = rawValue === undefined ? null : decodeXmlText(rawValue);
      } else if (type === 'b') {
        value = rawValue === '1';
      } else if (type === 'e') {
        // #REF!, #VALUE! and friends: no usable value.
        value = null;
      } else if (rawValue !== undefined && rawValue !== '') {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) {
          value = null;
        } else if (dateStyles.has(styleIndex)) {
          value = dayKeyFromExcelSerial(numeric);
        } else {
          value = numeric;
        }
      }

      if (columnIndex >= 0) {
        while (cells.length < columnIndex) cells.push(null);
        cells[columnIndex] = value === '' ? null : value;
      }
    }

    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }

  // Trailing blank rows are noise from spreadsheet apps that pad the grid.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === null)) {
    rows.pop();
  }

  return rows;
}

/** Resolves `xl/workbook.xml` sheet order and names to their worksheet parts. */
function resolveSheetParts(entries: Record<string, string>): { name: string; path: string }[] {
  const workbook = entries['xl/workbook.xml'];
  if (!workbook) throw new Error('Not a valid xlsx file (missing workbook)');

  const relationships = new Map<string, string>();
  const relsXml = entries['xl/_rels/workbook.xml.rels'] ?? '';
  const relPattern = /<Relationship\s[^>]*\/>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relPattern.exec(relsXml)) !== null) {
    const id = attribute(relMatch[0], 'Id');
    const target = attribute(relMatch[0], 'Target');
    if (id && target) {
      relationships.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  }

  const sheets: { name: string; path: string }[] = [];
  const sheetPattern = /<sheet\s[^>]*\/>/g;
  let sheetMatch: RegExpExecArray | null;
  let fallbackIndex = 0;
  while ((sheetMatch = sheetPattern.exec(workbook)) !== null) {
    fallbackIndex += 1;
    const name = attribute(sheetMatch[0], 'name') ?? `Sheet${fallbackIndex}`;
    const relationshipId = attribute(sheetMatch[0], 'r:id') ?? attribute(sheetMatch[0], 'id');
    const target = relationshipId ? relationships.get(relationshipId) : undefined;
    const path = `xl/${target ?? `worksheets/sheet${fallbackIndex}.xml`}`;
    sheets.push({ name, path });
  }

  return sheets;
}

/** Parses `.xlsx` bytes into plain per-sheet grids. Throws on malformed input. */
export function readXlsx(bytes: Uint8Array): XlsxWorkbook {
  const entries = readZipTextEntries(bytes);
  const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml']);
  const dateStyles = parseDateStyles(entries['xl/styles.xml']);

  const sheets = resolveSheetParts(entries)
    .filter((sheet) => entries[sheet.path] !== undefined)
    .map((sheet) => ({
      name: sheet.name,
      rows: parseSheet(entries[sheet.path], sharedStrings, dateStyles),
    }));

  if (sheets.length === 0) throw new Error('Not a valid xlsx file (no worksheets)');
  return { sheets };
}
