/**
 * Photos stored beside the automatic backups, once each.
 *
 * Embedding every photo in every backup made each daily copy as big as all the
 * user's photos together (as base64), ten times over in the rotation. An
 * automatic backup now lists its photos (`photos` in services/backupFile.ts)
 * and each target keeps one copy of each, named by its content's MD5 hash
 * (`money2time_PHOTO_<md5>.<ext>`), so a photo that has not changed is never
 * uploaded again and every backup that lists it shares the copy.
 *
 * A stored photo is deleted once no remaining backup lists it, and only when
 * every remaining backup could be read: one that cannot (offline, from another
 * phone, not downloaded yet) leaves every photo in place for the next rotation,
 * as does a listing that misses the backup just written. It must also be a day
 * old, so a photo another phone stored a moment ago for a backup it has not
 * written yet survives.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system/next';

import { I18n } from '~/lib/i18n';
import {
  type BackupPhotoRecord,
  type BackupRecord,
  isCompactBackupName,
} from '~/services/autoBackup.shared';
import { BACKUP_PHOTO_PREFIX, type BackupPhotoRef, isBackupPhotoName } from '~/services/backupFile';
import type { BackupData } from '~/services/dataManagementService';
import type { UserAssetFileEntry } from '~/services/userAssets';

/** The photo half of a backup target (services/autoBackupProviders/*). */
export interface BackupPhotoStore {
  listPhotos(): Promise<BackupPhotoRecord[]>;
  uploadPhoto(name: string, sourceUri: string): Promise<void>;
  downloadPhoto(photo: BackupPhotoRecord, destination: File): Promise<void>;
  deletePhoto(photo: BackupPhotoRecord): Promise<void>;
}

/** A photo a backup lists, with the file it is read from. */
export interface BackupPhotoUpload extends BackupPhotoRef {
  uri: string;
}

/** How old an unlisted stored photo must be before it is deleted. */
export const STORED_PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;
const RESOLVED_PHOTOS_FOLDER = 'backup-photos';
/** Photos stored at once while a backup catches up (the first after updating). */
const UPLOAD_CONCURRENCY = 3;
const PHOTO_LISTS_KEY = 'backupPhotos.lists.v1';

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
}

/**
 * Names each user-asset file by its content. The hash is computed natively, so
 * no photo is read into JavaScript. A file that vanished since the listing (the
 * orphan sweep, say) is left out rather than failing the backup.
 */
export async function describeBackupPhotos(
  files: UserAssetFileEntry[],
): Promise<BackupPhotoUpload[]> {
  const out: BackupPhotoUpload[] = [];
  for (const file of files) {
    try {
      const md5 = (await new File(file.uri).digest('MD5')).toLowerCase();
      const photo = `${BACKUP_PHOTO_PREFIX}${md5}.${extensionOf(file.path)}`;
      if (!md5 || !isBackupPhotoName(photo)) {
        console.warn(`[backupPhotos] cannot store ${file.path}`);
        continue;
      }
      out.push({ path: file.path, photo, uri: file.uri });
    } catch (error) {
      console.warn(`[backupPhotos] skipping vanished backup file: ${file.path}`, error);
    }
  }
  return out;
}

/**
 * Stores the photos the target does not have yet, a few at a time. Throws when
 * one fails; those already stored stay, so the next run carries on from there.
 */
export async function uploadMissingPhotos(
  store: BackupPhotoStore,
  photos: BackupPhotoUpload[],
): Promise<void> {
  if (photos.length === 0) return;
  const stored = new Set((await store.listPhotos()).map((photo) => photo.name));
  const queue = new Map<string, string>();
  for (const photo of photos) {
    if (!stored.has(photo.photo) && !queue.has(photo.photo)) queue.set(photo.photo, photo.uri);
  }
  const pending = [...queue];
  let failure: unknown = null;
  const worker = async () => {
    while (pending.length > 0 && failure === null) {
      const [name, uri] = pending.shift()!;
      try {
        await store.uploadPhoto(name, uri);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  if (failure !== null) throw failure;
}

function resolvedPhotosDir(): Directory {
  return new Directory(Paths.cache, RESOLVED_PHOTOS_FOLDER);
}

/** Deletes the photos the last restore downloaded. */
export function clearResolvedBackupPhotos(): void {
  try {
    const dir = resolvedPhotosDir();
    if (dir.exists) dir.delete();
  } catch {
    // The cache is the system's to clear too.
  }
}

/**
 * Downloads the photos a backup lists into the cache, as `assetFiles` the
 * restore copies into place. `stores` are tried in order.
 *
 * A store that could not be read, or a download that failed, throws before
 * anything is replaced, so the user can try again rather than lose photos the
 * target still has. A photo no reachable store has is gone: the data restores
 * without it, and `missing` counts it for the user.
 */
export async function resolveBackupPhotos(
  backup: BackupData,
  stores: BackupPhotoStore[],
): Promise<{ backup: BackupData; missing: number }> {
  const refs = backup.photos ?? [];
  if (refs.length === 0) return { backup, missing: 0 };
  clearResolvedBackupPhotos();
  const dir = resolvedPhotosDir();
  dir.create({ intermediates: true });

  const wanted = new Set(refs.map((ref) => ref.photo));
  const downloaded = new Map<string, string>();
  let unreachable = false;
  for (const store of stores) {
    if (downloaded.size === wanted.size) break;
    let listed: BackupPhotoRecord[];
    try {
      listed = await store.listPhotos();
    } catch (error) {
      console.warn('[backupPhotos] could not list stored photos', error);
      unreachable = true;
      continue;
    }
    for (const photo of listed) {
      if (!wanted.has(photo.name) || downloaded.has(photo.name)) continue;
      const destination = new File(dir, photo.name);
      try {
        if (destination.exists) destination.delete();
        await store.downloadPhoto(photo, destination);
        downloaded.set(photo.name, destination.uri);
      } catch (error) {
        console.warn(`[backupPhotos] could not download ${photo.name}`, error);
        unreachable = true;
      }
    }
  }
  const missing = wanted.size - downloaded.size;
  if (missing > 0 && unreachable) {
    clearResolvedBackupPhotos();
    throw new Error(I18n.t('backup_restore.photos_unavailable'));
  }
  if (missing > 0) console.warn(`[backupPhotos] ${missing} backup photo(s) not found`);
  return {
    backup: {
      ...backup,
      assetFiles: refs.flatMap((ref) => {
        const uri = downloaded.get(ref.photo);
        return uri ? [{ path: ref.path, uri }] : [];
      }),
    },
    // Counted by path: one photo can stand for several images.
    missing: refs.filter((ref) => !downloaded.has(ref.photo)).length,
  };
}

/**
 * The stored photos each backup lists, by `target:id`. A backup file never
 * changes once written, so what it lists can be remembered: the ones this
 * phone writes are known without reading them back. Kept in AsyncStorage too,
 * since a background run starts with nothing in memory.
 */
const photosByBackup = new Map<string, readonly string[]>();
let photoListsLoaded = false;

async function loadPhotoLists(): Promise<void> {
  if (photoListsLoaded) return;
  photoListsLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(PHOTO_LISTS_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (!saved || typeof saved !== 'object') return;
    for (const [key, names] of Object.entries(saved as Record<string, unknown>)) {
      if (photosByBackup.has(key) || !Array.isArray(names)) continue;
      photosByBackup.set(
        key,
        names.filter((name): name is string => typeof name === 'string'),
      );
    }
  } catch {
    // Nothing remembered: the backups are read instead.
  }
}

/** Saves the lists, forgetting this target's backups that rotation removed. */
async function savePhotoLists(target: string, kept: ReadonlySet<string>): Promise<void> {
  for (const key of [...photosByBackup.keys()]) {
    if (key.startsWith(`${target}:`) && !kept.has(key)) photosByBackup.delete(key);
  }
  try {
    await AsyncStorage.setItem(PHOTO_LISTS_KEY, JSON.stringify(Object.fromEntries(photosByBackup)));
  } catch {
    // Remembering is only a saving; the backups can always be read.
  }
}

const backupKey = (record: Pick<BackupRecord, 'target' | 'id'>) => `${record.target}:${record.id}`;

export function rememberBackupPhotos(
  record: Pick<BackupRecord, 'target' | 'id'>,
  photos: readonly BackupPhotoRef[],
): void {
  photosByBackup.set(
    backupKey(record),
    photos.map((photo) => photo.photo),
  );
}

/** Tests only: forget what earlier backups listed. */
export function resetBackupPhotoMemory(): void {
  photosByBackup.clear();
  photoListsLoaded = false;
}

/**
 * Deletes the target's stored photos that none of `backups` (what rotation
 * kept) lists. `readPhotos` reads a backup the phone has not seen to learn what
 * it lists; if it fails for any backup, nothing is deleted. Nor is anything
 * when `backups` misses `written`, the backup this run just wrote: a listing
 * that cannot see it may be missing others too. Older backups embed their
 * photos and list none. Returns how many photos were deleted.
 */
export async function pruneBackupPhotos(
  store: BackupPhotoStore,
  written: BackupRecord,
  backups: BackupRecord[],
  readPhotos: (record: BackupRecord) => Promise<readonly string[]>,
  now: number = Date.now(),
): Promise<number> {
  if (!backups.some((backup) => backupKey(backup) === backupKey(written))) return 0;
  await loadPhotoLists();
  const kept = new Set(backups.map(backupKey));
  try {
    return await prunePhotos(store, backups, readPhotos, now);
  } finally {
    await savePhotoLists(written.target, kept);
  }
}

async function prunePhotos(
  store: BackupPhotoStore,
  backups: BackupRecord[],
  readPhotos: (record: BackupRecord) => Promise<readonly string[]>,
  now: number,
): Promise<number> {
  const stored = await store.listPhotos();
  const candidates = stored.filter(
    (photo) => photo.createdAt !== null && now - photo.createdAt >= STORED_PHOTO_GRACE_MS,
  );
  if (candidates.length === 0) return 0;

  const listed = new Set<string>();
  const unread: BackupRecord[] = [];
  for (const backup of backups) {
    if (!isCompactBackupName(backup.id)) continue;
    const known = photosByBackup.get(backupKey(backup));
    if (known) known.forEach((name) => listed.add(name));
    else unread.push(backup);
  }
  // Usually every stored photo is in a backup already known, and nothing
  // needs to be read.
  if (candidates.every((photo) => listed.has(photo.name))) return 0;
  for (const backup of unread) {
    let names: readonly string[];
    try {
      names = await readPhotos(backup);
    } catch {
      return 0;
    }
    photosByBackup.set(backupKey(backup), names);
    names.forEach((name) => listed.add(name));
  }

  let deleted = 0;
  for (const photo of candidates) {
    if (listed.has(photo.name)) continue;
    try {
      await store.deletePhoto(photo);
      deleted += 1;
    } catch {
      // Best effort: the next rotation tries again.
    }
  }
  return deleted;
}
