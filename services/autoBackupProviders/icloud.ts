import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage';
import { Platform } from 'react-native';

import {
  AUTO_BACKUP_PREFIX,
  type BackupRecord,
  ICLOUD_FOLDER,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';

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

  async upload(name: string, json: string): Promise<BackupRecord> {
    const storage = getInstance();
    await ensureFolder(storage);
    const path = backupFilePath(name);
    await storage.writeFile(path, json);
    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'icloud',
      createdAt,
      sizeBytes: json.length,
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

  async download(record: BackupRecord): Promise<string> {
    const storage = getInstance();
    return storage.readFile(record.ref);
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
};

export type ICloudProvider = typeof iCloudProvider;
