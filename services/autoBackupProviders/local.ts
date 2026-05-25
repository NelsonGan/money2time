import { Directory, File, Paths } from 'expo-file-system/next';

import {
  AUTO_BACKUP_PREFIX,
  type BackupRecord,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';

const BACKUPS_SUBDIR = 'backups';

function ensureBackupsDir(): Directory {
  const dir = new Directory(Paths.document, BACKUPS_SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export const localProvider = {
  target: 'local' as const,

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async upload(name: string, json: string): Promise<BackupRecord> {
    const dir = ensureBackupsDir();
    const file = new File(dir, name);
    if (file.exists) file.delete();
    file.write(json);
    const size = file.size ?? json.length;
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
      if (!name.startsWith(AUTO_BACKUP_PREFIX)) continue;
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

  async download(record: BackupRecord): Promise<string> {
    const file = new File(record.ref);
    return file.text();
  },

  async delete(record: BackupRecord): Promise<void> {
    const file = new File(record.ref);
    if (file.exists) file.delete();
  },
};

export type LocalProvider = typeof localProvider;
