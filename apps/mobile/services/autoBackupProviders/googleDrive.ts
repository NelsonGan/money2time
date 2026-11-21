import { File } from 'expo-file-system/next';

import {
  AUTO_BACKUP_PREFIX,
  type BackupPhotoRecord,
  type BackupRecord,
  GOOGLE_DRIVE_FOLDER,
  isCompactBackupName,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import { isBackupPhotoName } from '~/services/backupFile';

import {
  createFolder,
  deleteFile,
  downloadFileBytes,
  downloadFileText,
  DriveError,
  type DriveFile,
  findFolderIds,
  listFolderChildren,
  uploadDriveFile,
} from './googleDriveApi';
import {
  getGoogleAccessToken,
  getGoogleDriveSessionState,
  type GoogleDriveUnavailableReason,
  isGoogleDriveConfigured,
} from './googleDriveAuth';

// The folder id is stable for the life of the install, so resolving it once
// saves a lookup on every backup, list, and delete. It also stops a burst of
// backups from each racing Drive's lagging file-list index and creating a
// duplicate folder. Cleared whenever Drive tells us the folder is gone (the
// user emptied their trash, or switched account) so the next call re-resolves
// rather than writing into nothing.
let cachedFolderId: string | null = null;

export function resetGoogleDriveFolderCache(): void {
  cachedFolderId = null;
}

/** The folder new backups are written to: the oldest one, or a fresh one. */
async function ensureFolderId(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const existing = await findFolderIds(GOOGLE_DRIVE_FOLDER);
  cachedFolderId = existing.length > 0 ? existing[0] : await createFolderOnce();
  return cachedFolderId;
}

/**
 * `createFolder` is not retried, because a create whose response was lost would
 * leave a duplicate behind. Recover by asking Drive whether it landed after
 * all, and only surface the failure if it clearly did not.
 */
async function createFolderOnce(): Promise<string> {
  try {
    return await createFolder(GOOGLE_DRIVE_FOLDER);
  } catch (error) {
    const landed = await findFolderIds(GOOGLE_DRIVE_FOLDER).catch(() => [] as string[]);
    if (landed.length > 0) return landed[0];
    throw error;
  }
}

/**
 * Drive reports a parent that no longer exists as a 404. Nothing broader:
 * treating any 4xx as "folder gone" would clear the cache and create a
 * replacement on an unrelated bad request, re-creating the duplicate-folder
 * problem this provider exists to fix.
 */
function isMissingParentError(error: unknown): boolean {
  return error instanceof DriveError && error.status === 404;
}

/** Uploads into the backup folder, re-resolving it once if it has gone. */
async function uploadToFolder(
  name: string,
  body: string | Uint8Array,
  mimeType: string,
): Promise<string> {
  const folderId = await ensureFolderId();
  try {
    return await uploadDriveFile(folderId, name, body, mimeType);
  } catch (error) {
    if (!isMissingParentError(error)) throw error;
    // The cached folder no longer exists. Re-resolve (creating it if needed)
    // and try once more before giving up.
    resetGoogleDriveFolderCache();
    return uploadDriveFile(await ensureFolderId(), name, body, mimeType);
  }
}

/**
 * Every file in every same-named backup folder. Reads all of them, not just the
 * one we write to: the old provider could scatter backups across duplicates it
 * had created, and those copies were invisible (and so never rotated) if Drive
 * happened to resolve a different folder first. Deliberately does not create
 * the folder: listing should not have a side effect on a brand-new account
 * that has never backed up.
 */
async function listBackupFolderFiles(): Promise<DriveFile[]> {
  const folderIds = await findFolderIds(GOOGLE_DRIVE_FOLDER);
  if (folderIds.length === 0) return [];
  cachedFolderId ??= folderIds[0] ?? null;
  const groups = await Promise.all(folderIds.map((id) => listFolderChildren(id)));
  return groups.flat();
}

const PHOTO_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const googleDriveProvider = {
  target: 'googleDrive' as const,

  async isAvailable(): Promise<boolean> {
    return (await googleDriveProvider.unavailableReason()) === null;
  },

  /**
   * Null when a backup can go to Drive now; otherwise why not, for analytics.
   * `no_token` is a restored session whose access token could not be minted.
   */
  async unavailableReason(): Promise<
    GoogleDriveUnavailableReason | 'not_configured' | 'no_token' | null
  > {
    if (!isGoogleDriveConfigured()) return 'not_configured';
    // Restores the native session first — after an app restart the account is
    // still remembered but the in-memory session (and therefore the token) is
    // not. See the note in googleDriveAuth.ts.
    const state = await getGoogleDriveSessionState();
    if (state !== 'connected') return state;
    return (await getGoogleAccessToken()) ? null : 'no_token';
  },

  async upload(name: string, bytes: Uint8Array): Promise<BackupRecord> {
    const fileId = await uploadToFolder(name, bytes, 'application/gzip');
    const createdAt = parseTimestampFromName(name) ?? new Date().toISOString();
    return {
      id: name,
      target: 'googleDrive',
      createdAt,
      sizeBytes: bytes.length,
      ref: fileId,
    };
  },

  async list(): Promise<BackupRecord[]> {
    const results: BackupRecord[] = [];
    const seen = new Set<string>();
    for (const file of await listBackupFolderFiles()) {
      if (!file.name.startsWith(AUTO_BACKUP_PREFIX)) continue;
      const createdAt = parseTimestampFromName(file.name);
      if (!createdAt) continue;
      // Same timestamp in two folders is the same backup written twice; keep
      // one row so the list doesn't show phantom duplicates.
      if (seen.has(file.name)) continue;
      seen.add(file.name);
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

  async download(record: BackupRecord): Promise<string | Uint8Array> {
    // An older plain-JSON backup reads as text, as it always did.
    return isCompactBackupName(record.id)
      ? downloadFileBytes(record.ref)
      : downloadFileText(record.ref);
  },

  async delete(record: BackupRecord): Promise<void> {
    await deleteFile(record.ref);
  },

  async listPhotos(): Promise<BackupPhotoRecord[]> {
    const photos = new Map<string, BackupPhotoRecord>();
    for (const file of await listBackupFolderFiles()) {
      // The same photo in two folders holds the same bytes; either will do.
      if (!isBackupPhotoName(file.name) || photos.has(file.name)) continue;
      const createdAt = file.createdTime ? Date.parse(file.createdTime) : NaN;
      photos.set(file.name, {
        name: file.name,
        ref: file.id,
        createdAt: Number.isNaN(createdAt) ? null : createdAt,
      });
    }
    return [...photos.values()];
  },

  async uploadPhoto(name: string, sourceUri: string): Promise<void> {
    const ext = name.slice(name.lastIndexOf('.') + 1);
    const bytes = await new File(sourceUri).bytes();
    await uploadToFolder(name, bytes, PHOTO_MIME_TYPES[ext] ?? 'application/octet-stream');
  },

  async downloadPhoto(photo: BackupPhotoRecord, destination: File): Promise<void> {
    await destination.write(await downloadFileBytes(photo.ref));
  },

  async deletePhoto(photo: BackupPhotoRecord): Promise<void> {
    await deleteFile(photo.ref);
  },
};

export type GoogleDriveProvider = typeof googleDriveProvider;
