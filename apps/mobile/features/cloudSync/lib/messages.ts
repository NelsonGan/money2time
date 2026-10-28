// User-facing text for Cloud Sync errors and times.

import { I18n } from '~/lib/i18n';

import type { CloudSyncErrorKind } from '../CloudSyncContext';
import { CloudSyncApiError } from '../services/cloudSyncApi';

/** The message for an error thrown by a sign-in, choice or account action. */
export function errorMessage(error: unknown): string {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'invalid_code') return I18n.t('cloud_sync.errors.invalid_code');
    if (error.code === 'rate_limited') return I18n.t('cloud_sync.errors.rate_limited');
    if (error.code === 'network') return I18n.t('cloud_sync.errors.offline');
  }
  if (error instanceof Error && error.message === 'backup_failed') {
    return I18n.t('cloud_sync.errors.backup_failed');
  }
  return I18n.t('cloud_sync.errors.unknown');
}

/** The message for the last background failure the provider recorded. */
export function kindMessage(kind: CloudSyncErrorKind): string {
  return I18n.t(`cloud_sync.errors.${kind}`);
}

/** "14:05" today, else "Oct 3, 14:05", in the app's locale. */
export function formatSyncedAt(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString(I18n.locale, { hour: 'numeric', minute: '2-digit' });
  if (new Date(now).toDateString() === date.toDateString()) return time;
  return `${date.toLocaleDateString(I18n.locale, { month: 'short', day: 'numeric' })}, ${time}`;
}
