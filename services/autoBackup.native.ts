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
  isBackupStale,
  MAX_AUTO_BACKUPS,
  selectExpiredRecords,
  sortRecordsNewestFirst,
} from '~/services/autoBackup.shared';
import {
  applyBackupJson,
  buildBackupJson,
  type ImportResult,
  parseBackupJson,
  summarizeBackup,
} from '~/services/dataManagementService';
import type { BackupTarget } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';

import {
  googleDriveProvider,
  resetGoogleDriveFolderCache,
} from './autoBackupProviders/googleDrive';
import { DriveError } from './autoBackupProviders/googleDriveApi';
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

interface Provider {
  target: BackupTarget;
  isAvailable(): Promise<boolean>;
  upload(name: string, json: string): Promise<BackupRecord>;
  list(): Promise<BackupRecord[]>;
  download(record: BackupRecord): Promise<string>;
  delete(record: BackupRecord): Promise<void>;
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

    const { json } = await buildBackupJson();
    const name = buildAutoBackupName();

    const { targets, fellBackToLocalFrom } = await pickActiveTargets(settings.autoBackupTarget);
    const written: BackupRecord[] = [];
    const errors: string[] = [];

    if (fellBackToLocalFrom) {
      errors.push(
        I18n.t('auto_backup.fallback_local_error', { target: targetLabel(fellBackToLocalFrom) }),
      );
    }

    for (const target of targets) {
      const provider = getProvider(target);
      try {
        const record = await provider.upload(name, json);
        written.push(record);
        await rotate(provider);
      } catch (e) {
        errors.push(describeBackupError(target, e));
      }
    }

    // Persist outcome. Treat "any successful write" as success.
    const success = written.length > 0;
    settingsRepository.updateSettings({
      lastAutoBackupAt: success ? new Date().toISOString() : settings.lastAutoBackupAt,
      lastAutoBackupError: success && errors.length === 0 ? null : errors.join('; ') || null,
    });

    void trackEvent(AnalyticsEvents.AUTO_BACKUP_RUN, {
      target: settings.autoBackupTarget,
      written_count: written.length,
      errors_count: errors.length,
      trigger: opts?.force ? 'manual' : 'auto',
    });
    if (errors.length > 0) {
      void trackEvent(AnalyticsEvents.AUTO_BACKUP_FAILED, {
        target: settings.autoBackupTarget,
        message: errors.join('; '),
      });
    }

    return { skipped: false, written, errors, fellBackToLocalFrom };
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
}

async function pickActiveTargets(preferred: BackupTarget): Promise<ActiveTargets> {
  if (preferred === 'local') return { targets: ['local'] };
  const provider = getProvider(preferred);
  const available = await provider.isAvailable();
  if (available) return { targets: [preferred] };
  // Cloud target chosen but currently unavailable (offline, signed out,
  // iCloud disabled). Fall back to local so the daily backup window isn't
  // silently lost, and report which target we couldn't reach so the caller can
  // tell the user why their backup landed on the device.
  return { targets: ['local'], fellBackToLocalFrom: preferred };
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

async function rotate(provider: Provider): Promise<void> {
  try {
    const all = await provider.list();
    const expired = selectExpiredRecords(all, MAX_AUTO_BACKUPS);
    for (const record of expired) {
      try {
        await provider.delete(record);
      } catch {
        // Best-effort; never throw from rotation.
      }
    }
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

export async function restoreFromBackup(record: BackupRecord): Promise<ImportResult> {
  const provider = getProvider(record.target);
  let json: string;
  try {
    json = await provider.download(record);
  } catch (e) {
    return { canceled: false, success: false, error: getErrorMessage(e, 'Failed to read backup') };
  }
  const result = applyBackupJson(json);
  if (result.success) {
    void trackEvent(AnalyticsEvents.AUTO_BACKUP_RESTORED, { target: record.target });
  }
  return result;
}

export async function previewBackup(record: BackupRecord) {
  const provider = getProvider(record.target);
  const json = await provider.download(record);
  const data = parseBackupJson(json);
  return summarizeBackup(data);
}

export async function deleteBackup(record: BackupRecord): Promise<void> {
  const provider = getProvider(record.target);
  await provider.delete(record);
  void trackEvent(AnalyticsEvents.AUTO_BACKUP_DELETED, { target: record.target });
}

export async function isTargetAvailable(target: BackupTarget): Promise<boolean> {
  return getProvider(target).isAvailable();
}

// ---------------------------------------------------------------------------
// Background task lifecycle
// ---------------------------------------------------------------------------

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
