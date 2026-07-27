import {
  AUTO_BACKUP_PREFIX,
  type BackupRecord,
  GOOGLE_DRIVE_FOLDER,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';

import {
  ensureGoogleSession,
  getGoogleAccessToken,
  isGoogleDriveConfigured,
} from './googleDriveAuth';
import {
  createFolder,
  deleteFile,
  DriveError,
  downloadFileText,
  findFolderId,
  listFolderChildren,
  uploadJsonFile,
} from './googleDriveApi';

// The folder id is stable for the life of the install, so resolving it once
// saves a lookup on every backup, list, and delete. Cleared whenever Drive
// tells us the folder is gone (the user emptied their trash, or switched
// account) so the next call re-resolves rather than writing into nothing.
let cachedFolderId: string | null = null;

export function resetGoogleDriveFolderCache(): void {
  cachedFolderId = null;
}

async function ensureFolderId(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const existing = await findFolderId(GOOGLE_DRIVE_FOLDER);
  cachedFolderId = existing ?? (await createFolder(GOOGLE_DRIVE_FOLDER));
  return cachedFolderId;
}

/** Drive answers "the parent you named doesn't exist" with a 404 or a 400. */
function isMissingParentError(error: unknown): boolean {
  return error instanceof DriveError && (error.status === 404 || error.status === 400);
}

export const googleDriveProvider = {
  target: 'googleDrive' as const,

  async isAvailable(): Promise<boolean> {
    if (!isGoogleDriveConfigured()) return false;
    // Restores the native session first — after an app restart the account is
    // still remembered but the in-memory session (and therefore the token) is
    // not. See the note in googleDriveAuth.ts.
    if (!(await ensureGoogleSession())) return false;
    return Boolean(await getGoogleAccessToken());
  },

  async upload(name: string, json: string): Promise<BackupRecord> {
    const folderId = await ensureFolderId();
    let fileId: string;
    try {
      fileId = await uploadJsonFile(folderId, name, json);
    } catch (error) {
      if (!isMissingParentError(error)) throw error;
      // The cached folder no longer exists. Re-resolve (creating it if needed)
      // and try once more before giving up.
      resetGoogleDriveFolderCache();
      fileId = await uploadJsonFile(await ensureFolderId(), name, json);
    }

    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'googleDrive',
      createdAt,
      sizeBytes: json.length,
      ref: fileId,
    };
  },

  async list(): Promise<BackupRecord[]> {
    // Deliberately does not create the folder: listing should not have a side
    // effect on a brand-new account that has never backed up.
    const folderId = cachedFolderId ?? (await findFolderId(GOOGLE_DRIVE_FOLDER));
    if (!folderId) return [];
    cachedFolderId = folderId;

    const files = await listFolderChildren(folderId);
    const results: BackupRecord[] = [];
    for (const file of files) {
      if (!file.name.startsWith(AUTO_BACKUP_PREFIX)) continue;
      const createdAt = parseTimestampFromName(file.name);
      if (!createdAt) continue;
      results.push({
        id: file.name,
        target: 'googleDrive',
        createdAt,
        sizeBytes: file.sizeBytes,
        ref: file.id,
      });
    }
    return results;
  },

  async download(record: BackupRecord): Promise<string> {
    return downloadFileText(record.ref);
  },

  async delete(record: BackupRecord): Promise<void> {
    await deleteFile(record.ref);
  },
};

export type GoogleDriveProvider = typeof googleDriveProvider;
