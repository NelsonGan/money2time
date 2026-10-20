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

TaskManager.defineTask(AUTO_BACKUP_TASK_ID, async () => {
  try {
    await runAutoBackupIfDue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
