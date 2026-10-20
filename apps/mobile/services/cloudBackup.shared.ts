/** Types and pure rules shared by the native Cloud Backup service and its stub. */

export const CLOUD_BACKUP_DEFAULT_URL = 'https://workers-cloud-backup.money2time.com';
export const WEB_DASHBOARD_URL = 'https://app.money2time.com';
/** The backup format version the app writes (dataManagementService BACKUP_VERSION). */
export const CLOUD_BACKUP_SCHEMA_VERSION = 3;
/** A day, less a margin so a daily habit at a slightly earlier hour still runs. */
export const CLOUD_BACKUP_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** The Worker's base URL; `EXPO_PUBLIC_MONEY2TIME_WORKERS_CLOUD_BACKUP` overrides production. */
export function cloudBackupBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_CLOUD_BACKUP?.trim();
  return (raw || CLOUD_BACKUP_DEFAULT_URL).replace(/\/+$/, '');
}

export type CloudBackupErrorCode =
  | 'unauthenticated'
  | 'not_primary'
  | 'offline'
  | 'server'
  | 'no_backup'
  | 'checksum'
  | 'corrupt'
  | 'rate_limited'
  | 'invalid_code'
  | 'google_unavailable'
  | 'cancelled'
  | 'session_not_fresh';

export type CloudDevice = {
  id: string;
  platform: string;
  name: string | null;
  appVersion: string | null;
  lastSeenAt: number;
};

export type CloudBackupMeta = {
  id: string;
  deviceId: string;
  createdAt: number;
  size: number;
  sha256: string;
  schemaVersion: number;
  appVersion: string | null;
  exportedAt: string | null;
};

export type CloudBackupStatus = {
  user: { id: string; email: string };
  deviceId: string;
  isPrimary: boolean;
  pro: boolean;
  primaryDevice: CloudDevice | null;
  devices: CloudDevice[];
  backup: CloudBackupMeta | null;
  lastBackupAt: string | null;
  lastError: string | null;
};

export type CloudBackupRunResult =
  | {
      skipped: true;
      reason: 'signed_out' | 'fresh' | 'not_primary' | 'unauthenticated' | 'unavailable';
    }
  | { skipped: false; backup: CloudBackupMeta };

export class CloudBackupError extends Error {
  readonly code: CloudBackupErrorCode;
  readonly primaryDevice: CloudDevice | null;

  constructor(code: CloudBackupErrorCode, primaryDevice: CloudDevice | null = null) {
    super(code);
    this.code = code;
    this.primaryDevice = primaryDevice;
  }
}

export function isCloudBackupStale(lastBackupAt: string | null, now = Date.now()): boolean {
  if (!lastBackupAt) return true;
  const at = Date.parse(lastBackupAt);
  return !Number.isFinite(at) || now - at >= CLOUD_BACKUP_INTERVAL_MS;
}
