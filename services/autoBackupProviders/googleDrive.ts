import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage';

import {
  AUTO_BACKUP_PREFIX,
  type BackupRecord,
  GOOGLE_DRIVE_FOLDER,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';

import { getGoogleAccessToken, isGoogleDriveConfigured, isGoogleSignedIn } from './googleDriveAuth';

const FOLDER_PATH = `/${GOOGLE_DRIVE_FOLDER}`;

// Drive's default request timeout in react-native-cloud-storage is 3000ms,
// which aborts even modestly-sized JSON uploads on slow networks. The
// "Aborted" error backed by this. Bump to 30s — backup writes are not
// latency-sensitive.
const DRIVE_REQUEST_TIMEOUT_MS = 30_000;

let cached: CloudStorage | null = null;

function getInstance(): CloudStorage {
  if (!cached) {
    cached = new CloudStorage(CloudStorageProvider.GoogleDrive, {
      scope: CloudStorageScope.Documents,
      accessToken: null,
      strictFilenames: false,
      timeout: DRIVE_REQUEST_TIMEOUT_MS,
    });
  }
  return cached;
}

async function refreshAccessToken(storage: CloudStorage): Promise<boolean> {
  const token = await getGoogleAccessToken();
  if (!token) return false;
  storage.setProviderOptions({
    scope: CloudStorageScope.Documents,
    accessToken: token,
    strictFilenames: false,
    timeout: DRIVE_REQUEST_TIMEOUT_MS,
  });
  return true;
}

// `storage.exists(path)` throws on the Google Drive provider when the path
// has no corresponding Drive file (the error is "could not get file id for
// path …"). Treat any throw as "does not exist".
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
    // Race: a parallel call created it. Re-check; if still missing, surface.
    if (!(await safeExists(storage, FOLDER_PATH))) throw e;
  }
}

function backupFilePath(name: string): string {
  return `${FOLDER_PATH}/${name}`;
}

export const googleDriveProvider = {
  target: 'googleDrive' as const,

  async isAvailable(): Promise<boolean> {
    if (!isGoogleDriveConfigured()) return false;
    if (!isGoogleSignedIn()) return false;
    const storage = getInstance();
    return refreshAccessToken(storage);
  },

  async upload(name: string, json: string): Promise<BackupRecord> {
    const storage = getInstance();
    const tokenOk = await refreshAccessToken(storage);
    if (!tokenOk) throw new Error('Google Drive: not signed in');
    await ensureFolder(storage);
    const path = backupFilePath(name);
    await storage.writeFile(path, json);
    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'googleDrive',
      createdAt,
      sizeBytes: json.length,
      ref: path,
    };
  },

  async list(): Promise<BackupRecord[]> {
    const storage = getInstance();
    const tokenOk = await refreshAccessToken(storage);
    if (!tokenOk) return [];
    if (!(await safeExists(storage, FOLDER_PATH))) return [];
    let entries: string[] = [];
    try {
      entries = await storage.readdir(FOLDER_PATH);
    } catch {
      // Folder vanished between checks, or transient API error.
      return [];
    }

    const results: BackupRecord[] = [];
    for (const name of entries) {
      if (!name.startsWith(AUTO_BACKUP_PREFIX)) continue;
      const createdAt = parseTimestampFromName(name);
      if (!createdAt) continue;
      const path = backupFilePath(name);
      let size = 0;
      try {
        const stat = await storage.stat(path);
        size = stat.size;
      } catch {
        // unknown size
      }
      results.push({
        id: name,
        target: 'googleDrive',
        createdAt,
        sizeBytes: size,
        ref: path,
      });
    }
    return results;
  },

  async download(record: BackupRecord): Promise<string> {
    const storage = getInstance();
    const tokenOk = await refreshAccessToken(storage);
    if (!tokenOk) throw new Error('Google Drive: not signed in');
    return storage.readFile(record.ref);
  },

  async delete(record: BackupRecord): Promise<void> {
    const storage = getInstance();
    const tokenOk = await refreshAccessToken(storage);
    if (!tokenOk) return;
    if (!(await safeExists(storage, record.ref))) return;
    try {
      await storage.unlink(record.ref);
    } catch {
      // Already gone or transient — treat as success.
    }
  },
};

export type GoogleDriveProvider = typeof googleDriveProvider;
