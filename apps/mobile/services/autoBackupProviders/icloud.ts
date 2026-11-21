import { File, Paths } from 'expo-file-system/next';
import { Platform } from 'react-native';
import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage';

import {
  AUTO_BACKUP_PREFIX,
  type BackupPhotoRecord,
  type BackupRecord,
  ICLOUD_FOLDER,
  isCompactBackupName,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import { isBackupPhotoName } from '~/services/backupFile';

const FOLDER_PATH = `/${ICLOUD_FOLDER}`;

let cached: CloudStorage | null = null;

function getInstance(): CloudStorage {
  if (!cached) {
    cached = new CloudStorage(CloudStorageProvider.ICloud, {
      scope: CloudStorageScope.Documents,
    });
  }
  return cached;
}

// iCloud's exists() is more forgiving than Drive's, but a not-yet-synced
// container can still throw. Mirror the Drive provider's defensive shape.
async function safeExists(storage: CloudStorage, path: string): Promise<boolean> {
  try {
    return await storage.exists(path);
  } catch {
    return false;
  }
}

async function ensureFolder(storage: CloudStorage): Promise<void> {
  if (await safeExists(storage, FOLDER_PATH)) return;
  try {
    await storage.mkdir(FOLDER_PATH);
  } catch (e) {
    if (!(await safeExists(storage, FOLDER_PATH))) throw e;
  }
}

function backupFilePath(name: string): string {
  return `${FOLDER_PATH}/${name}`;
}

/**
 * The library copies files by plain path (`URL(fileURLWithPath:)`), not by
 * `file://` URI.
 */
function localPath(file: File): string {
  return decodeURIComponent(file.uri.replace(/^file:\/\//, ''));
}

/**
 * The library writes text only, so binary content goes through a file in the
 * cache, copied natively.
 */
function cacheFile(name: string): File {
  const file = new File(Paths.cache, `icloud-${Date.now()}-${name}`);
  if (file.exists) file.delete();
  return file;
}

/**
 * A file iCloud has not downloaded to this phone yet can show up as a hidden
 * placeholder, `.<name>.icloud`. It is the file all the same.
 */
function cloudFileName(entry: string): string {
  const placeholder = /^\.(.+)\.icloud$/.exec(entry);
  return placeholder ? placeholder[1] : entry;
}

const DOWNLOAD_WAIT_MS = 60_000;
const DOWNLOAD_POLL_MS = 500;

/** Asks iCloud to download a file not on this phone yet, and waits for it. */
async function ensureDownloaded(storage: CloudStorage, path: string): Promise<void> {
  if (await safeExists(storage, path)) return;
  await storage.triggerSync(path);
  const deadline = Date.now() + DOWNLOAD_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_POLL_MS));
    if (await safeExists(storage, path)) return;
  }
  throw new Error(`iCloud did not download ${path}`);
}

const PHOTO_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const iCloudProvider = {
  target: 'icloud' as const,

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      const storage = getInstance();
      return await storage.isCloudAvailable();
    } catch {
      return false;
    }
  },

  async upload(name: string, bytes: Uint8Array): Promise<BackupRecord> {
    const storage = getInstance();
    await ensureFolder(storage);
    const path = backupFilePath(name);
    const staged = cacheFile(name);
    try {
      await staged.write(bytes);
      await storage.uploadFile(path, localPath(staged), { mimeType: 'application/gzip' });
    } finally {
      if (staged.exists) staged.delete();
    }
    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'icloud',
      createdAt,
      sizeBytes: bytes.length,
      ref: path,
    };
  },

  async list(): Promise<BackupRecord[]> {
    const storage = getInstance();
    if (!(await safeExists(storage, FOLDER_PATH))) return [];
    let entries: string[] = [];
    try {
      entries = await storage.readdir(FOLDER_PATH);
    } catch {
      return [];
    }

    const results: BackupRecord[] = [];
    for (const name of entries.map(cloudFileName)) {
      if (!name.startsWith(AUTO_BACKUP_PREFIX)) continue;
      const createdAt = parseTimestampFromName(name);
      if (!createdAt) continue;
      const path = backupFilePath(name);
      let size = 0;
      try {
        const stat = await storage.stat(path);
        size = stat.size;
      } catch {
        // Some iCloud entries may not be downloaded yet; size unknown.
      }
      results.push({
        id: name,
        target: 'icloud',
        createdAt,
        sizeBytes: size,
        ref: path,
      });
    }
    return results;
  },

  async download(record: BackupRecord): Promise<string | Uint8Array> {
    const storage = getInstance();
    // An older plain-JSON backup reads as text, as it always did.
    if (!isCompactBackupName(record.id)) return storage.readFile(record.ref);
    await ensureDownloaded(storage, record.ref);
    const staged = cacheFile(record.id);
    try {
      await storage.downloadFile(record.ref, localPath(staged));
      return await staged.bytes();
    } finally {
      if (staged.exists) staged.delete();
    }
  },

  async delete(record: BackupRecord): Promise<void> {
    const storage = getInstance();
    if (!(await safeExists(storage, record.ref))) return;
    try {
      await storage.unlink(record.ref);
    } catch {
      // Already gone or transient — treat as success.
    }
  },

  async listPhotos(): Promise<BackupPhotoRecord[]> {
    const storage = getInstance();
    if (!(await safeExists(storage, FOLDER_PATH))) return [];
    let names: string[];
    try {
      names = await storage.readdir(FOLDER_PATH);
    } catch {
      // Unreadable now: nothing counts as stored, so nothing is deleted and
      // the photos are written again (over themselves).
      return [];
    }
    const photos: BackupPhotoRecord[] = [];
    for (const name of names.map(cloudFileName)) {
      if (!isBackupPhotoName(name)) continue;
      const path = backupFilePath(name);
      let createdAt: number | null = null;
      try {
        // The time it was stored: uploadPhoto writes a fresh file.
        const stat = await storage.stat(path);
        createdAt = stat.birthtimeMs || null;
      } catch {
        // Not downloaded yet: kept until its age is known.
      }
      photos.push({ name, ref: path, createdAt });
    }
    return photos;
  },

  async uploadPhoto(name: string, sourceUri: string): Promise<void> {
    const storage = getInstance();
    await ensureFolder(storage);
    const ext = name.slice(name.lastIndexOf('.') + 1);
    // Written afresh rather than copied: a copy keeps the source's dates, and
    // a photo picked months ago would look old enough to delete (the cleanup's
    // one-day grace reads the stored file's creation time).
    const staged = cacheFile(name);
    try {
      await staged.write(await new File(sourceUri).bytes());
      await storage.uploadFile(backupFilePath(name), localPath(staged), {
        mimeType: PHOTO_MIME_TYPES[ext] ?? 'application/octet-stream',
      });
    } finally {
      if (staged.exists) staged.delete();
    }
  },

  async downloadPhoto(photo: BackupPhotoRecord, destination: File): Promise<void> {
    const storage = getInstance();
    await ensureDownloaded(storage, photo.ref);
    await storage.downloadFile(photo.ref, localPath(destination));
  },

  async deletePhoto(photo: BackupPhotoRecord): Promise<void> {
    const storage = getInstance();
    if (!(await safeExists(storage, photo.ref))) return;
    await storage.unlink(photo.ref);
  },
};

export type ICloudProvider = typeof iCloudProvider;
