/**
 * Shared types and pure helpers for the cloud-backup opt-in prompt.
 *
 * Auto-backup defaults to on-device (local) storage, which is lost if the app
 * is uninstalled. After a user logs a transaction we occasionally nudge them to
 * move backups to iCloud / Google Drive — but only on an opt-in cadence:
 *   - never if they're already on a cloud target,
 *   - at most `MAX_SHOWS` times total,
 *   - at least `MIN_DAYS_BETWEEN_PROMPTS` days apart,
 *   - and only once they've logged a few transactions worth protecting.
 *
 * Eligibility is a pure function over persisted state so it can be exhaustively
 * unit-tested without touching native modules or storage.
 */

export const CLOUD_BACKUP_PROMPT_STORAGE_KEY = '@m2t/cloud_backup_prompt_state/v1';

export const CLOUD_BACKUP_PROMPT_SCHEMA_VERSION = 1;

/** Maximum number of times the prompt is ever shown. */
export const MAX_SHOWS = 3;

/** Minimum days between successive prompts. */
export const MIN_DAYS_BETWEEN_PROMPTS = 14;

/** Transactions the user must have logged before the first prompt is eligible. */
export const MIN_TRANSACTIONS_BEFORE_PROMPT = 3;

export type CloudBackupPromptSkipReason =
  | 'already_on_cloud'
  | 'max_shows_reached'
  | 'too_recent'
  | 'too_few_transactions';

export interface CloudBackupPromptState {
  schemaVersion: number;
  shownCount: number;
  lastShownAt: string | null;
}

export interface CloudBackupEligibilityInput {
  state: CloudBackupPromptState;
  now: Date;
  isOnCloudBackup: boolean;
  transactionCount: number;
}

export type CloudBackupEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: CloudBackupPromptSkipReason };

export function createInitialState(): CloudBackupPromptState {
  return {
    schemaVersion: CLOUD_BACKUP_PROMPT_SCHEMA_VERSION,
    shownCount: 0,
    lastShownAt: null,
  };
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return Number.isFinite(new Date(value).getTime());
}

function numericField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function parseStoredState(raw: string | null): CloudBackupPromptState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.schemaVersion !== CLOUD_BACKUP_PROMPT_SCHEMA_VERSION) return null;
    return {
      schemaVersion: CLOUD_BACKUP_PROMPT_SCHEMA_VERSION,
      shownCount: numericField(value.shownCount),
      lastShownAt: isValidIsoDate(value.lastShownAt) ? value.lastShownAt : null,
    };
  } catch {
    return null;
  }
}

function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  // Treat an unparseable timestamp as "just happened" so corrupted state blocks
  // the prompt (suppresses) rather than spamming it.
  if (!Number.isFinite(then)) return 0;
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

export function checkEligibility(input: CloudBackupEligibilityInput): CloudBackupEligibilityResult {
  const { state, now, isOnCloudBackup, transactionCount } = input;

  if (isOnCloudBackup) {
    return { eligible: false, reason: 'already_on_cloud' };
  }
  if (transactionCount < MIN_TRANSACTIONS_BEFORE_PROMPT) {
    return { eligible: false, reason: 'too_few_transactions' };
  }
  if (state.shownCount >= MAX_SHOWS) {
    return { eligible: false, reason: 'max_shows_reached' };
  }
  if (state.lastShownAt && daysSince(state.lastShownAt, now) < MIN_DAYS_BETWEEN_PROMPTS) {
    return { eligible: false, reason: 'too_recent' };
  }
  return { eligible: true };
}

export function markShown(state: CloudBackupPromptState, now: Date): CloudBackupPromptState {
  return {
    ...state,
    shownCount: state.shownCount + 1,
    lastShownAt: now.toISOString(),
  };
}
