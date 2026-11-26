import * as BackgroundTask from 'expo-background-task';
import { Platform } from 'react-native';

import { I18n } from '~/lib/i18n';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  AUTO_BACKUP_TASK_ID,
  BACKGROUND_INTERVAL_MINUTES,
  type BackupRecord,
  type BackupRunResult,
  buildAutoBackupName,
  buildRecoveryBackupName,
  isBackupStale,
  isInFailureBackoff,
  MAX_AUTO_BACKUPS,
  selectExpiredRecords,
  sortRecordsNewestFirst,
} from '~/services/autoBackup.shared';
import { decodeBackupFile, encodeBackupFile } from '~/services/backupFile';
import {
  type BackupPhotoStore,
  type BackupPhotoUpload,
  BackupPhotoVanishedError,
  clearResolvedBackupPhotos,
  describeBackupPhotos,
  pruneBackupPhotos,
  rememberBackupPhotos,
  resolveBackupPhotos,
  uploadMissingPhotos,
} from '~/services/backupPhotos';
import {
  applyBackupData,
  type BackupData,
  buildBackupData,
  type ImportResult,
  yieldToEventLoop,
} from '~/services/dataManagementService';
import { shrinkStoredPhotos } from '~/services/imageShrink';
import type { BackupTarget } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';

import {
  googleDriveProvider,
  resetGoogleDriveFolderCache,
} from './autoBackupProviders/googleDrive';
import { DriveError, driveFailureDetails } from './autoBackupProviders/googleDriveApi';
import {
  signInWithGoogle as signInWithGoogleAuth,
  signOutFromGoogle as signOutFromGoogleAuth,
} from './autoBackupProviders/googleDriveAuth';
import { iCloudProvider } from './autoBackupProviders/icloud';
import { localProvider } from './autoBackupProviders/local';

export * from './autoBackup.shared';
export {
  ensureGoogleSession,
  getGoogleAccountEmail,
  isGoogleDriveConfigured,
} from './autoBackupProviders/googleDriveAuth';

// Both sides of an account change invalidate the cached Drive folder id: the
// folder belongs to the account that was signed in, and signing in as someone
// else (which the picker allows without signing out first) makes it a file this
// session can no longer write to.

export async function signInWithGoogle(): ReturnType<typeof signInWithGoogleAuth> {
  resetGoogleDriveFolderCache();
  return signInWithGoogleAuth();
}

export async function signOutFromGoogle(): Promise<void> {
  await signOutFromGoogleAuth();
  resetGoogleDriveFolderCache();
}

interface Provider extends BackupPhotoStore {
  target: BackupTarget;
  isAvailable(): Promise<boolean>;
  /** Why the target cannot take a backup now (null when it can), for analytics. */
  unavailableReason?(): Promise<string | null>;
  upload(name: string, bytes: Uint8Array): Promise<BackupRecord>;
  list(): Promise<BackupRecord[]>;
  /** Gzip bytes for a compact backup, text for an older JSON one. */
  download(record: BackupRecord): Promise<string | Uint8Array>;
  delete(record: BackupRecord): Promise<void>;
}

/** One backup, encoded once and written to each target with its photos. */
interface PreparedBackup {
  bytes: Uint8Array;
  photos: BackupPhotoUpload[];
}

/**
 * Builds the compact backup file, which lists its photos rather than embedding
 * them. Large stored photos are shrunk first, so the copies stored beside the
 * backups are the small ones.
 */
async function prepareBackup(): Promise<PreparedBackup> {
  await shrinkStoredPhotos();
  const data = await buildBackupData({ assetFiles: true });
  const photos = await describeBackupPhotos(data.assetFiles ?? []);
  // Reading every table and packing the result each take a noticeable slice of
  // the JS thread on a large database; let a frame render between the two.
  await yieldToEventLoop();
  const bytes = await encodeBackupFile(
    data,
    photos.map(({ path, photo }) => ({ path, photo })),
  );
  return { bytes, photos };
}

/** Stores the photos the target lacks, then the backup that lists them. */
async function writeBackup(
  provider: Provider,
  name: string,
  prepared: PreparedBackup,
): Promise<BackupRecord> {
  await uploadMissingPhotos(provider, prepared.photos);
  const record = await provider.upload(name, prepared.bytes);
  rememberBackupPhotos(record, prepared.photos);
  return record;
}

function getProvider(target: BackupTarget): Provider {
  switch (target) {
    case 'icloud':
      return iCloudProvider;
    case 'googleDrive':
      return googleDriveProvider;
    case 'local':
    default:
      return localProvider;
  }
}

// Re-entrancy guard. The foreground listener, manual button, and background
// task can all trigger this simultaneously; we want only one run at a time.
// A `force` call (manual "Back up now") waits for the in-flight run to finish
// then starts its own — otherwise an in-flight non-forced run that skips on
// staleness would silently swallow the user's explicit tap.
let runningPromise: Promise<BackupRunResult> | null = null;

// When the last automatic run failed outright (nothing written anywhere). Kept
// in memory: a cold start may try again, but the foregrounds after a failure
// wait out AUTO_BACKUP_FAILURE_BACKOFF_MS instead of each failing again.
let lastAutomaticFailureAt: number | null = null;

export async function runAutoBackupIfDue(opts?: { force?: boolean }): Promise<BackupRunResult> {
  if (runningPromise) {
    const existing = await runningPromise;
    if (!opts?.force) return existing;
    // Fall through to start a new forced run.
  }

  const promise = (async (): Promise<BackupRunResult> => {
    const settings = settingsRepository.get();
    if (!opts?.force && !settings.autoBackupEnabled) {
      return { skipped: true, reason: 'disabled', written: [], errors: [] };
    }
    if (!opts?.force && !isBackupStale(settings.lastAutoBackupAt)) {
      return { skipped: true, reason: 'fresh', written: [], errors: [] };
    }
    if (!opts?.force && isInFailureBackoff(lastAutomaticFailureAt)) {
      return { skipped: true, reason: 'backoff', written: [], errors: [] };
    }

    let prepared = await prepareBackup();
    const name = buildAutoBackupName();
    // A photo deleted after the backup listed it fails its copy. The run is
    // often the one a receipt scan's launch starts, and that scan deletes its
    // image when it finishes, so prepare the backup once more without it (once
    // per run; any other failure is reported as it is).
    let preparedAgain = false;
    const write = async (provider: Provider): Promise<BackupRecord> => {
      try {
        return await writeBackup(provider, name, prepared);
      } catch (error) {
        if (!(error instanceof BackupPhotoVanishedError) || preparedAgain) throw error;
        preparedAgain = true;
        prepared = await prepareBackup();
        await yieldToEventLoop();
        return writeBackup(provider, name, prepared);
      }
    };
    // Writing the file is the third long step after reading and serializing.
    await yieldToEventLoop();

    const { targets, fellBackToLocalFrom, unavailableReason } = await pickActiveTargets(
      settings.autoBackupTarget,
    );
    const written: BackupRecord[] = [];
    const errors: string[] = [];
    // Machine-readable reason for each entry in `errors`, for analytics.
    const errorKinds: string[] = [];
    // HTTP status and Drive reason of the last provider failure, for analytics.
    // For an unreachable Drive, the reason says why (signed out, no access).
    let lastFailure: ReturnType<typeof driveFailureDetails> = {
      httpStatus: null,
      driveReason: unavailableReason ?? null,
    };
    // The cloud target was reached but refused or dropped the upload, and the
    // backup went to the phone instead.
    let savedOnDeviceAfterFailure = false;

    if (fellBackToLocalFrom) {
      errors.push(
        I18n.t('auto_backup.fallback_local_error', { target: targetLabel(fellBackToLocalFrom) }),
      );
      errorKinds.push('unavailable');
    }

    for (const target of targets) {
      const provider = getProvider(target);
      try {
        const record = await write(provider);
        written.push(record);
        await rotate(provider, record);
        continue;
      } catch (e) {
        errors.push(describeBackupError(target, e));
        errorKinds.push(backupErrorKind(e));
        // The phone write after an unreachable cloud target keeps the reason
        // that target gave (signed out, no Drive access) rather than its own.
        if (target !== 'local' || lastFailure.driveReason === null) {
          lastFailure = driveFailureDetails(e);
        }
      }
      // Only Drive says why it failed. iCloud throws plain errors, often from a
      // container that has not synced yet, which pass on their own: those keep
      // the old behaviour and retry later today rather than end the day on the
      // phone.
      if (target !== 'googleDrive') continue;
      // A failure that usually passes (offline, timeout, rate limit, server,
      // aborted) writes nothing, as before: the run stays due and the six-hour
      // backoff tries the cloud again later today.
      if (TRANSIENT_BACKUP_ERROR_KINDS.has(errorKinds[errorKinds.length - 1])) continue;
      // A Drive that is full, refuses this account or rejects the upload used to
      // leave nothing written anywhere, so the backup stayed due and every
      // automatic run six hours later failed and reported the same way again.
      // Keep the day's copy on the phone, as an unreachable target does. The
      // cloud failure stays the reported one (`error_kind` is the first kind),
      // even if this write fails too.
      try {
        const record = await write(localProvider);
        written.push(record);
        savedOnDeviceAfterFailure = true;
        await rotate(localProvider, record);
      } catch (e) {
        errors.push(describeBackupError('local', e));
        errorKinds.push(backupErrorKind(e));
      }
    }

    // Persist outcome. Treat "any successful write" as success.
    const success = written.length > 0;
    if (!opts?.force) lastAutomaticFailureAt = success ? null : Date.now();
    settingsRepository.updateSettings({
      lastAutoBackupAt: success ? new Date().toISOString() : settings.lastAutoBackupAt,
      lastAutoBackupError: success && errors.length === 0 ? null : errors.join('; ') || null,
    });

    // Successful runs are deliberately not tracked: a daily background job fires
    // for every install every day, which would spend the event budget on an
    // event nobody segments on. Only failures below are worth an event.
    if (errors.length > 0) {
      void trackEvent(AnalyticsEvents.AUTO_BACKUP_FAILED, {
        target: settings.autoBackupTarget,
        trigger: opts?.force ? 'manual' : 'automatic',
        error_count: errors.length,
        // The first kind is the cause: the cloud target's, not the phone
        // write's that followed it.
        error_kind: errorKinds[0] ?? 'unknown',
        fell_back_to_local: Boolean(fellBackToLocalFrom) || savedOnDeviceAfterFailure,
        http_status: lastFailure.httpStatus,
        drive_reason: lastFailure.driveReason,
      });
    }

    return { skipped: false, written, errors, fellBackToLocalFrom, savedOnDeviceAfterFailure };
  })();

  runningPromise = promise;
  try {
    return await promise;
  } finally {
    // Only clear if we're still the active promise — a queued forced run that
    // started after us may have replaced us, in which case it owns the slot.
    if (runningPromise === promise) runningPromise = null;
  }
}

interface ActiveTargets {
  targets: BackupTarget[];
  fellBackToLocalFrom?: BackupTarget;
  /** Why `fellBackToLocalFrom` was unreachable, when the provider can say. */
  unavailableReason?: string | null;
}

async function pickActiveTargets(preferred: BackupTarget): Promise<ActiveTargets> {
  if (preferred === 'local') return { targets: ['local'] };
  const provider = getProvider(preferred);
  let unavailableReason: string | null = null;
  if (provider.unavailableReason) {
    unavailableReason = await provider.unavailableReason();
    if (unavailableReason === null) return { targets: [preferred] };
  } else if (await provider.isAvailable()) {
    return { targets: [preferred] };
  }
  // Cloud target chosen but currently unavailable (offline, signed out,
  // iCloud disabled). Fall back to local so the daily backup window isn't
  // silently lost, and report which target we couldn't reach so the caller can
  // tell the user why their backup landed on the device.
  return { targets: ['local'], fellBackToLocalFrom: preferred, unavailableReason };
}

/**
 * Turns a provider failure into something a user can act on. The raw strings
 * these providers throw ("Aborted", "Could not get file id for path /Money2Time")
 * told users nothing about whether to reconnect, free up space, or just retry.
 */
function describeBackupError(target: BackupTarget, error: unknown): string {
  const reason =
    error instanceof DriveError
      ? I18n.t(`auto_backup.error.${error.kind}`)
      : getErrorMessage(error, I18n.t('auto_backup.error.unknown'));
  return I18n.t('auto_backup.error.prefix', { target: targetLabel(target), reason });
}

/** Cloud failures that usually pass on their own; they get no phone copy. */
const TRANSIENT_BACKUP_ERROR_KINDS: ReadonlySet<string> = new Set([
  'offline',
  'timeout',
  'rate_limited',
  'server',
  'aborted',
]);

/**
 * A short reason for analytics: the Drive error kind, `aborted` for a cancelled
 * request, `photo_deleted` for a listed photo deleted again after the backup was
 * prepared a second time, `unknown` otherwise. Never the message, which can carry a file path.
 */
function backupErrorKind(error: unknown): string {
  if (error instanceof DriveError) return error.kind;
  if (error instanceof BackupPhotoVanishedError) return 'photo_deleted';
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  return 'unknown';
}

function targetLabel(target: BackupTarget): string {
  switch (target) {
    case 'icloud':
      return I18n.t('auto_backup.target.icloud');
    case 'googleDrive':
      return I18n.t('auto_backup.target.google_drive');
    case 'local':
    default:
      return I18n.t('auto_backup.target.local');
  }
}

/** The stored photos a backup lists, read from the backup itself. */
async function readBackupPhotoNames(
  provider: Provider,
  record: BackupRecord,
): Promise<readonly string[]> {
  const backup = await decodeBackupFile(await provider.download(record));
  return (backup.photos ?? []).map((photo) => photo.photo);
}

/** Deletes the oldest backups past the limit, then the photos none still lists. */
async function rotate(provider: Provider, written: BackupRecord): Promise<void> {
  try {
    const all = await provider.list();
    const expired = selectExpiredRecords(all, MAX_AUTO_BACKUPS);
    const deleted = new Set<BackupRecord>();
    for (const record of expired) {
      try {
        await provider.delete(record);
        deleted.add(record);
      } catch {
        // Best-effort; never throw from rotation.
      }
    }
    const kept = all.filter((record) => !deleted.has(record));
    await pruneBackupPhotos(provider, written, kept, (record) =>
      readBackupPhotoNames(provider, record),
    );
  } catch {
    // Best-effort; never throw from rotation.
  }
}

export async function listAllBackups(): Promise<BackupRecord[]> {
  // Run all providers in parallel — Drive and iCloud are network-bound and
  // can each take 1–2s. Serializing them was the cause of the previously
  // sluggish list refresh after a backup.
  const tasks: Promise<BackupRecord[]>[] = [localProvider.list().catch(() => [])];
  if (Platform.OS === 'ios') {
    tasks.push(
      iCloudProvider
        .isAvailable()
        .then((ok) => (ok ? iCloudProvider.list() : []))
        .catch(() => []),
    );
  }
  tasks.push(
    googleDriveProvider
      .isAvailable()
      .then((ok) => (ok ? googleDriveProvider.list() : []))
      .catch(() => []),
  );
  const groups = await Promise.all(tasks);
  return sortRecordsNewestFirst(groups.flat());
}

export async function restoreFromBackup(
  record: BackupRecord,
  restore?: (backup: BackupData) => Promise<ImportResult>,
): Promise<ImportResult> {
  const provider = getProvider(record.target);
  let payload: string | Uint8Array;
  try {
    payload = await provider.download(record);
  } catch (e) {
    return { canceled: false, success: false, error: getErrorMessage(e, 'Failed to read backup') };
  }
  let result: ImportResult;
  try {
    const backup = await decodeBackupFile(payload);
    result = await withBackupPhotos(backup, [provider], async (resolved) =>
      restore ? restore(resolved) : applyBackupData(resolved),
    );
  } catch (error) {
    return { canceled: false, success: false, error: getErrorMessage(error, 'Invalid backup') };
  }
  if (result.success) {
    void trackEvent(AnalyticsEvents.AUTO_BACKUP_RESTORED, {
      target: record.target,
      missing_photos: result.missingPhotos ?? 0,
    });
  }
  return result;
}

/**
 * Runs a restore with the photos a compact backup lists downloaded from
 * `stores`, and deletes the downloads after. Throws, restoring nothing, when a
 * store could not be read; a successful result counts the photos no store had.
 */
async function withBackupPhotos(
  backup: BackupData,
  stores: BackupPhotoStore[],
  run: (backup: BackupData) => Promise<ImportResult>,
): Promise<ImportResult> {
  if (!backup.photos?.length) return run(backup);
  try {
    const resolved = await resolveBackupPhotos(backup, stores);
    const result = await run(resolved.backup);
    return result.success && resolved.missing > 0
      ? { ...result, missingPhotos: resolved.missing + (result.missingPhotos ?? 0) }
      : result;
  } finally {
    clearResolvedBackupPhotos();
  }
}

/**
 * Restores a backup file the user picked. A compact automatic backup copied
 * out of its folder lists photos stored beside it there, which are looked for
 * on the phone, then in iCloud and Google Drive when they are connected.
 */
export async function restoreImportedBackup(
  backup: BackupData,
  restore: (backup: BackupData) => Promise<ImportResult>,
): Promise<ImportResult> {
  const stores: BackupPhotoStore[] = [];
  if (backup.photos?.length) {
    stores.push(localProvider);
    if (Platform.OS === 'ios' && (await iCloudProvider.isAvailable().catch(() => false))) {
      stores.push(iCloudProvider);
    }
    const driveReason = await googleDriveProvider
      .unavailableReason()
      .catch(() => 'session_unavailable' as const);
    if (driveReason === null) {
      stores.push(googleDriveProvider);
    } else if (
      (driveReason === 'session_unavailable' || driveReason === 'no_token') &&
      backsUpToDrive()
    ) {
      // This phone backs up to Drive, which cannot be reached now (offline, a
      // token that would not refresh): photos it has would count as gone, so
      // the restore stops and asks to try again instead. Only then: a Drive
      // this phone does not use would otherwise block the import for good.
      stores.push({
        ...googleDriveProvider,
        listPhotos: () => Promise.reject(new Error(`Google Drive unavailable: ${driveReason}`)),
      });
    }
  }
  return withBackupPhotos(backup, stores, restore);
}

function backsUpToDrive(): boolean {
  try {
    const settings = settingsRepository.get();
    return settings.autoBackupEnabled && settings.autoBackupTarget === 'googleDrive';
  } catch {
    return false;
  }
}

/** Always local, never rotated here, and never overwrites the backup being restored. */
export async function saveRestoreSafetyBackup(): Promise<BackupRecord> {
  const prepared = await prepareBackup();
  const existing = new Set((await localProvider.list()).map((record) => record.id));
  let time = Date.now();
  let name = buildRecoveryBackupName(new Date(time));
  while (existing.has(name)) {
    time += 1000;
    name = buildRecoveryBackupName(new Date(time));
  }
  return writeBackup(localProvider, name, prepared);
}

export async function deleteBackup(record: BackupRecord): Promise<void> {
  const provider = getProvider(record.target);
  await provider.delete(record);
  void trackEvent(AnalyticsEvents.AUTO_BACKUP_DELETED, { target: record.target });
}

export async function isTargetAvailable(target: BackupTarget): Promise<boolean> {
  return getProvider(target).isAvailable();
}

// Background task lifecycle

export async function registerBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return;
    }
    await BackgroundTask.registerTaskAsync(AUTO_BACKUP_TASK_ID, {
      minimumInterval: BACKGROUND_INTERVAL_MINUTES,
    });
  } catch {
    // Best-effort; never throw from registration.
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK_ID);
  } catch {
    // ignore
  }
}
