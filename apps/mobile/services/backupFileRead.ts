import { type File, FileMode } from 'expo-file-system/next';

import { isGzip } from '~/utils/gzipSlices';

/**
 * A backup file's content: its bytes when gzipped (version 6), its text
 * otherwise, read natively so an older multi-megabyte backup is never decoded
 * in JavaScript. The first two bytes decide, not the file name.
 */
export async function readBackupFile(file: File): Promise<string | Uint8Array> {
  const handle = file.open(FileMode.ReadOnly);
  let head: Uint8Array;
  try {
    head = handle.readBytesSync(2);
  } finally {
    handle.close();
  }
  return isGzip(head) ? file.bytes() : file.text();
}
