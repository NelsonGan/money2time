import { Directory, File, Paths } from 'expo-file-system/next';

import {
  type BackupPhotoRecord,
  type BackupRecord,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import { isBackupPhotoName } from '~/services/backupFile';
import { readBackupFile } from '~/services/backupFileRead';

const BACKUPS_SUBDIR = 'backups';

function ensureBackupsDir(): Directory {
  const dir = new Directory(Paths.document, BACKUPS_SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

/** A file's creation time, or its last change where the platform has none. */
function storedAt(file: File): number | null {
  return file.creationTime ?? file.modificationTime ?? null;
}

/**
 * A photo copy an app kill cut short (`uploadPhoto`): never renamed into
 * place, so nothing names it. An hour old, no copy can still be writing it.
 */
function isStalePartialCopy(file: File): boolean {
  if (!file.name.startsWith('money2time_PHOTO_') || !file.name.endsWith('.partial')) return false;
  const at = storedAt(file);
  return at !== null && Date.now() - at > 60 * 60 * 1000;
}

export const localProvider = {
  target: 'local' as const,
  listsUploadsAtOnce: true,

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async upload(name: string, bytes: Uint8Array): Promise<BackupRecord> {
    const dir = ensureBackupsDir();
    const file = new File(dir, name);
    if (file.exists) file.delete();
    await file.write(bytes);
    const size = file.size ?? bytes.length;
    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'local',
      createdAt,
      sizeBytes: size,
      ref: file.uri,
    };
  },

  async list(): Promise<BackupRecord[]> {
    const dir = ensureBackupsDir();
    if (!dir.exists) return [];
    const entries = dir.list();
    const records: BackupRecord[] = [];
    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      const name = entry.name;
      const createdAt = parseTimestampFromName(name);
      if (!createdAt) continue;
      records.push({
        id: name,
        target: 'local',
        createdAt,
        sizeBytes: entry.size ?? 0,
        ref: entry.uri,
      });
    }
    return records;
  },

  async download(record: BackupRecord): Promise<string | Uint8Array> {
    return readBackupFile(new File(record.ref));
  },

  async delete(record: BackupRecord): Promise<void> {
    const file = new File(record.ref);
    if (file.exists) file.delete();
  },

  async listPhotos(): Promise<BackupPhotoRecord[]> {
    const photos: BackupPhotoRecord[] = [];
    for (const entry of ensureBackupsDir().list()) {
      if (!(entry instanceof File)) continue;
      if (isStalePartialCopy(entry)) {
        try {
          entry.delete();
        } catch {
          // The next listing tries again.
        }
        continue;
      }
      if (!isBackupPhotoName(entry.name)) continue;
      photos.push({ name: entry.name, ref: entry.uri, createdAt: storedAt(entry) });
    }
    return photos;
  },

  async uploadPhoto(name: string, sourceUri: string): Promise<void> {
    const dir = ensureBackupsDir();
    const file = new File(dir, name);
    // Named by its content: one already there holds the same bytes, since it
    // only ever arrives whole (below).
    if (file.exists) return;
    // Copied under another name and renamed, so a copy cut short (the app
    // killed mid-backup) never leaves a truncated photo under the real name.
    // The name is this copy's own: a recovery copy can run beside a backup.
    const partial = new File(
      dir,
      `${name}.${Date.now()}-${Math.random().toString(36).slice(2)}.partial`,
    );
    try {
      await new File(sourceUri).copy(partial);
    } catch (error) {
      if (partial.exists) partial.delete();
      throw error;
    }
    // After the move `partial` names the stored photo itself (a move points
    // the File at its destination), so nothing may delete through it after.
    partial.moveSync(file, { overwrite: true });
  },

  async downloadPhoto(photo: BackupPhotoRecord, destination: File): Promise<void> {
    await new File(photo.ref).copy(destination);
  },

  async deletePhoto(photo: BackupPhotoRecord): Promise<void> {
    const file = new File(photo.ref);
    if (file.exists) file.delete();
  },
};

export type LocalProvider = typeof localProvider;
