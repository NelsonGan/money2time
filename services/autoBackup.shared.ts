import type { BackupTarget } from '~/types';

export const AUTO_BACKUP_TASK_ID = 'money2time-auto-backup';
export const AUTO_BACKUP_PREFIX = 'money2time_AUTO_';
export const AUTO_BACKUP_EXTENSION = '.json';
export const MAX_AUTO_BACKUPS = 10;
export const BACKUP_STALENESS_HOURS = 24;
export const BACKGROUND_INTERVAL_MINUTES = 60 * 12; // 12h hint to the OS scheduler

export const ICLOUD_FOLDER = 'Money2Time';
export const GOOGLE_DRIVE_FOLDER = 'Money2Time';

export interface BackupRecord {
  id: string;
  target: BackupTarget;
  createdAt: string;
  sizeBytes: number;
  // Local: absolute file URI. iCloud: container-relative path. Drive: file id.
  ref: string;
}

export interface BackupRunResult {
  skipped: boolean;
  reason?: 'disabled' | 'fresh' | 'in_progress';
  written: BackupRecord[];
  errors: string[];
  // Set when the chosen cloud target was unreachable and the backup was written
  // to the device instead. Callers surface this — a silent local write looks
  // identical to a successful cloud backup otherwise.
  fellBackToLocalFrom?: BackupTarget;
}

export function buildAutoBackupName(now = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${AUTO_BACKUP_PREFIX}${iso}${AUTO_BACKUP_EXTENSION}`;
}

export function parseTimestampFromName(name: string): string | null {
  if (!name.startsWith(AUTO_BACKUP_PREFIX)) return null;
  const stem = name.slice(AUTO_BACKUP_PREFIX.length).replace(AUTO_BACKUP_EXTENSION, '');
  // Reverse of buildAutoBackupName: "2026-05-24T09-14-00" → "2026-05-24T09:14:00Z"
  const restored = stem.replace(/-(\d{2})-(\d{2})$/, ':$1:$2').replace('T', 'T') + 'Z';
  const t = Date.parse(restored);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

export function isBackupStale(lastIso: string | null, hours = BACKUP_STALENESS_HOURS): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= hours * 60 * 60 * 1000;
}

export function sortRecordsNewestFirst(records: BackupRecord[]): BackupRecord[] {
  return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function selectExpiredRecords(
  records: BackupRecord[],
  max = MAX_AUTO_BACKUPS,
): BackupRecord[] {
  const sorted = sortRecordsNewestFirst(records);
  return sorted.slice(max);
}
