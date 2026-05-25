import * as BackgroundTask from 'expo-background-task';
import { Platform } from 'react-native';

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

import { googleDriveProvider } from './autoBackupProviders/googleDrive';
import {
  getCurrentGoogleUser,
  isGoogleDriveConfigured,
  isGoogleSignedIn,
  signInWithGoogle,
  signOutFromGoogle,
} from './autoBackupProviders/googleDriveAuth';
import { iCloudProvider } from './autoBackupProviders/icloud';
import { localProvider } from './autoBackupProviders/local';

export * from './autoBackup.shared';
export {
  getCurrentGoogleUser,
  isGoogleDriveConfigured,
  isGoogleSignedIn,
  signInWithGoogle,
  signOutFromGoogle,
} from './autoBackupProviders/googleDriveAuth';

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

    const { json } = buildBackupJson();
    const name = buildAutoBackupName();

    const targets = await pickActiveTargets(settings.autoBackupTarget);
    const written: BackupRecord[] = [];
    const errors: string[] = [];

    for (const target of targets) {
      const provider = getProvider(target);
      try {
        const record = await provider.upload(name, json);
        written.push(record);
        await rotate(provider);
      } catch (e) {
        errors.push(`${target}: ${getErrorMessage(e, 'unknown error')}`);
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

    return { skipped: false, written, errors };
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

async function pickActiveTargets(preferred: BackupTarget): Promise<BackupTarget[]> {
  if (preferred === 'local') return ['local'];
  const provider = getProvider(preferred);
  const available = await provider.isAvailable();
  if (available) return [preferred];
  // Cloud target chosen but currently unavailable (offline, signed out,
  // iCloud disabled). Fall back to local so the daily backup window isn't
  // silently lost — the user can see the local row and the error message
  // explaining what happened.
  return ['local'];
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
