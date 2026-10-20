/**
 * Top-level background task registration for auto-backup.
 *
 * Must be imported synchronously from App.tsx so that `TaskManager.defineTask`
 * runs before the OS may invoke the task. The actual schedule/unschedule is
 * driven from AppContext based on the user's preference.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { AUTO_BACKUP_TASK_ID, runAutoBackupIfDue } from './autoBackup';
import { runCloudBackupIfDue } from './cloudBackup';

// One task runs both: the auto-backup to the user's chosen target, and the
// Cloud Backup upload when this phone is signed in and primary. Each skips on
// its own when it is off or not yet due.
TaskManager.defineTask(AUTO_BACKUP_TASK_ID, async () => {
  const results = await Promise.allSettled([runAutoBackupIfDue(), runCloudBackupIfDue()]);
  return results.some((result) => result.status === 'rejected')
    ? BackgroundTask.BackgroundTaskResult.Failed
    : BackgroundTask.BackgroundTaskResult.Success;
});
