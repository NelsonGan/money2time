/**
 * Web / unsupported-platform fallback for auto-backup.
 *
 * The app only ships on iOS/Android, but Metro resolves `~/services/autoBackup`
 * to this file when running outside `.native.ts` targets (and TS picks this for
 * its own type-checking pass). All actions are safe no-ops; return types match
 * the native implementation so callers compile against a single shape.
 */

import type { BackupRecord, BackupRunResult } from './autoBackup.shared';
import type { BackupSummary, ImportResult } from './dataManagementService';
import type { BackupTarget } from '~/types';

export * from './autoBackup.shared';

export async function runAutoBackupIfDue(_opts?: { force?: boolean }): Promise<BackupRunResult> {
  return { skipped: true, reason: 'disabled', written: [], errors: [] };
}

export async function listAllBackups(): Promise<BackupRecord[]> {
  return [];
}

export async function restoreFromBackup(_record: BackupRecord): Promise<ImportResult> {
  return { canceled: false, success: false, error: 'Auto-backup not available on this platform' };
}

export async function previewBackup(_record: BackupRecord): Promise<BackupSummary | null> {
  return null;
}

export async function deleteBackup(_record: BackupRecord): Promise<void> {}

export async function isTargetAvailable(_target: BackupTarget): Promise<boolean> {
  return false;
}

export async function registerBackgroundTask(): Promise<void> {}
export async function unregisterBackgroundTask(): Promise<void> {}

export function isGoogleDriveConfigured(): boolean {
  return false;
}
export function isGoogleSignedIn(): boolean {
  return false;
}
export async function ensureGoogleSession(_opts?: { force?: boolean }): Promise<boolean> {
  return false;
}
export async function getGoogleAccountEmail(): Promise<string | null> {
  return null;
}

interface FakeGoogleUser {
  user: { email: string | null };
}
export function getCurrentGoogleUser(): FakeGoogleUser | null {
  return null;
}

export type GoogleSignInResult =
  | { ok: true; email: string | null }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  return { ok: false, reason: 'unavailable', message: 'Not available' };
}
export async function signOutFromGoogle(): Promise<void> {}
