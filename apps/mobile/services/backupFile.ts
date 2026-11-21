/**
 * The backup file format, written and read. Pure: no native imports, so the
 * whole round trip is unit tested.
 *
 * Version 6 is the compact file every backup is now written as. It is gzipped
 * JSON, its tables are `{ columns, rows }` instead of one object per row (the
 * column names were over half of an uncompressed backup), and an automatic
 * backup lists its photos (`photos`) instead of embedding them: each one is
 * stored once beside the backups, named by a hash of its content (see
 * services/backupPhotos.ts). `version` 6 makes an older app refuse the file;
 * `dataVersion` carries what versions 3, 4 and 5 always meant (one ledger,
 * several, owned shared ledgers), so a decoded file is the same `BackupData`
 * an older backup gives and every restore path reads it unchanged.
 *
 * Versions 1 to 5 were plain JSON with one object per row and photos embedded
 * as base64. They are read exactly as before.
 */
import type { BackupData } from '~/services/dataManagementService';
import { gunzipText, gzipText, isGzip } from '~/utils/gzipSlices';

export const BACKUP_FILE_VERSION = 6;
/** What `version` meant before the compact format; a v6 file's `dataVersion`. */
const SUPPORTED_DATA_VERSIONS = new Set([1, 2, 3, 4, 5]);
/** Stored photos are named `money2time_PHOTO_<md5>.<ext>` (see backupPhotos.ts). */
export const BACKUP_PHOTO_PREFIX = 'money2time_PHOTO_';
// The extension only labels the stored copy; any short one is accepted so no
// user file is ever left out of a backup for its name.
const BACKUP_PHOTO_NAME = /^money2time_PHOTO_[0-9a-f]{32}\.[a-z0-9]{1,8}$/;

/** A photo an automatic backup lists: where it goes, and the stored file holding it. */
export interface BackupPhotoRef {
  /** Path under user-assets/, e.g. `album-covers/9f3c.jpg`. */
  path: string;
  /** The stored photo's file name beside the backups. */
  photo: string;
}

type Row = Record<string, unknown>;

interface PackedTable {
  columns: string[];
  rows: unknown[][];
}

export function isBackupPhotoName(name: string): boolean {
  return BACKUP_PHOTO_NAME.test(name);
}

/**
 * One table as columns and rows when every row has the same columns, which is
 * what `SELECT *` gives. Nulls stay in the rows, so a restore writes exactly
 * what the row held. A table whose rows differ (or hold `undefined`, which JSON
 * would turn into null) stays one object per row, which the reader also takes.
 */
function packTable(rows: Row[]): PackedTable | Row[] {
  if (rows.length === 0) return rows;
  const columns = Object.keys(rows[0]);
  const known = new Set(columns);
  const packed: unknown[][] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || keys.some((key) => !known.has(key))) return rows;
    const values = columns.map((column) => row[column]);
    if (values.includes(undefined)) return rows;
    packed.push(values);
  }
  return { columns, rows: packed };
}

function unpackTable(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  const table = value as Partial<PackedTable> | null;
  if (
    !table ||
    typeof table !== 'object' ||
    !Array.isArray(table.columns) ||
    !Array.isArray(table.rows) ||
    table.columns.some((column) => typeof column !== 'string')
  ) {
    throw new Error('Invalid backup format');
  }
  const { columns } = table;
  return table.rows.map((values) => {
    if (!Array.isArray(values) || values.length !== columns.length) {
      throw new Error('Invalid backup format');
    }
    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row;
  });
}

/**
 * The v6 JSON text of a backup. `photos` lists the photos stored beside the
 * backups instead of `data.userAssets`; without it the photos are embedded,
 * as an exported file that leaves the app on its own needs.
 */
export function backupFileJson(data: BackupData, photos?: BackupPhotoRef[]): string {
  const tables: Record<string, PackedTable | Row[]> = {};
  for (const [name, rows] of Object.entries(data.tables)) {
    if (rows) tables[name] = packTable(rows);
  }
  return JSON.stringify({
    version: BACKUP_FILE_VERSION,
    dataVersion: data.version,
    exportedAt: data.exportedAt,
    tables,
    ...(photos ? { photos } : { userAssets: data.userAssets ?? [] }),
    ...(data.sharedLedgers ? { sharedLedgers: data.sharedLedgers } : {}),
  });
}

/** The gzipped v6 file. */
export async function encodeBackupFile(
  data: BackupData,
  photos?: BackupPhotoRef[],
): Promise<Uint8Array> {
  return gzipText(backupFileJson(data, photos));
}

function validPhotoRefs(value: unknown): BackupPhotoRef[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some(
      (ref) =>
        !ref ||
        typeof ref.path !== 'string' ||
        typeof ref.photo !== 'string' ||
        !isBackupPhotoName(ref.photo),
    )
  ) {
    throw new Error('Invalid backup format');
  }
  return value as BackupPhotoRef[];
}

function checkSharedLedgers(version: number, sharedLedgers: BackupData['sharedLedgers']) {
  if (
    version === 5 &&
    (!Array.isArray(sharedLedgers) ||
      sharedLedgers.some(
        (ledger) =>
          !ledger || typeof ledger.ledgerId !== 'string' || typeof ledger.shareId !== 'string',
      ))
  ) {
    throw new Error('Invalid shared ledger backup');
  }
}

/** A backup's JSON text, of any version, as the `BackupData` every restore reads. */
export function parseBackupJson(json: string): BackupData {
  const parsed = JSON.parse(json) as Record<string, unknown> | null;
  if (!parsed || typeof parsed.version !== 'number' || !parsed.tables) {
    throw new Error('Invalid backup format');
  }
  if (parsed.version !== BACKUP_FILE_VERSION) {
    if (!SUPPORTED_DATA_VERSIONS.has(parsed.version)) {
      throw new Error(`Unsupported backup version: ${parsed.version}`);
    }
    const legacy = parsed as unknown as BackupData;
    checkSharedLedgers(legacy.version, legacy.sharedLedgers);
    // Only a v6 file lists stored photos; a field of that name elsewhere is not
    // ours. `assetFiles` is never in a file: one there would make a restore
    // copy whatever local file it names into the user's images.
    delete legacy.photos;
    delete legacy.assetFiles;
    return legacy;
  }

  const dataVersion = parsed.dataVersion;
  if (typeof dataVersion !== 'number' || !SUPPORTED_DATA_VERSIONS.has(dataVersion)) {
    throw new Error(`Unsupported backup version: ${String(dataVersion)}`);
  }
  if (typeof parsed.tables !== 'object' || Array.isArray(parsed.tables)) {
    throw new Error('Invalid backup format');
  }
  const tables: Record<string, Row[]> = {};
  for (const [name, value] of Object.entries(parsed.tables as Record<string, unknown>)) {
    tables[name] = unpackTable(value);
  }
  const sharedLedgers = parsed.sharedLedgers as BackupData['sharedLedgers'];
  checkSharedLedgers(dataVersion, sharedLedgers);
  const photos = validPhotoRefs(parsed.photos);
  return {
    version: dataVersion,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    tables: tables as unknown as BackupData['tables'],
    ...(Array.isArray(parsed.userAssets)
      ? { userAssets: parsed.userAssets as BackupData['userAssets'] }
      : {}),
    ...(photos ? { photos } : {}),
    ...(sharedLedgers ? { sharedLedgers } : {}),
  };
}

/**
 * A backup file as read from disk or a download: gzip bytes (version 6), or the
 * JSON text of any version. The bytes decide, not the file name.
 */
export async function decodeBackupFile(payload: string | Uint8Array): Promise<BackupData> {
  if (typeof payload === 'string') return parseBackupJson(payload);
  let text: string;
  try {
    if (isGzip(payload)) {
      text = await gunzipText(payload);
    } else {
      const { strFromU8 } = await import('fflate');
      text = strFromU8(payload);
    }
  } catch {
    // A truncated download or a damaged file: say so plainly, not in zlib's words.
    throw new Error('Invalid backup format');
  }
  return parseBackupJson(text);
}
