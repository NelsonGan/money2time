/**
 * Web / unsupported-platform fallback for Cloud Backup. The app ships on iOS
 * and Android only; Metro and TypeScript resolve `~/services/cloudBackup` here
 * outside `.native.ts` targets. Everything is a safe no-op with the native
 * module's shapes.
 */

import {
  CloudBackupError,
  type CloudBackupMeta,
  type CloudBackupRunResult,
  type CloudBackupStatus,
} from './cloudBackup.shared';
import type { BackupSummary, ImportResult } from './dataManagementService';

export * from './cloudBackup.shared';

const unavailable = () => new CloudBackupError('server');

export async function hasCloudSession(): Promise<boolean> {
  return false;
}

export async function getSignedInEmail(): Promise<string | null> {
  return null;
}

export async function refreshCloudStatus(): Promise<CloudBackupStatus> {
  throw unavailable();
}

export async function makeThisPhonePrimary(): Promise<void> {
  throw unavailable();
}

export async function runCloudBackupIfDue(_opts?: {
  force?: boolean;
  trigger?: 'automatic' | 'manual';
}): Promise<CloudBackupRunResult> {
  return { skipped: true, reason: 'unavailable' };
}

export async function previewCloudBackup(): Promise<{
  meta: CloudBackupMeta;
  summary: BackupSummary;
  json: string;
}> {
  throw unavailable();
}

export function restoreCloudBackupJson(_json: string): ImportResult {
  return {
    canceled: false,
    success: false,
    error: 'Cloud Backup is not available on this platform',
  };
}

export async function deleteCloudBackup(): Promise<void> {
  throw unavailable();
}

export async function sendSignInCode(_email: string): Promise<void> {
  throw unavailable();
}

export async function signInWithCode(_email: string, _code: string): Promise<void> {
  throw unavailable();
}

export async function signInWithGoogleAccount(): Promise<void> {
  throw unavailable();
}

export async function signOutOfCloud(): Promise<void> {}

export async function deleteCloudAccount(): Promise<void> {
  throw unavailable();
}
