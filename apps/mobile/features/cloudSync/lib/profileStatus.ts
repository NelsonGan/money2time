// The Cloud Sync state the Settings profile card's pill shows.

import type { CloudSyncErrorKind, CloudSyncStatus } from '../CloudSyncContext';

/**
 * `on` synced and healthy, `busy` a sync or the first link in progress,
 * `off` signed out, `problem` offline, failed or paused.
 */
export type ProfileSyncTone = 'on' | 'busy' | 'off' | 'problem';

export interface ProfileSyncState {
  tone: ProfileSyncTone;
  /** Key under `cloud_sync.` for the short status after "Cloud Sync", or null for none. */
  statusKey: string | null;
}

export interface ProfileSyncInput {
  status: CloudSyncStatus;
  isSyncing: boolean;
  lastError: CloudSyncErrorKind | null;
  linked: boolean;
}

/** Null when the pill is hidden (a build without Cloud Sync). */
export function profileSyncState({
  status,
  isSyncing,
  lastError,
  linked,
}: ProfileSyncInput): ProfileSyncState | null {
  switch (status) {
    case 'unavailable':
      return null;
    case 'loading':
      return { tone: 'off', statusKey: null };
    case 'signedOut':
      return { tone: 'off', statusKey: 'profile_off' };
    case 'linking':
    case 'needsChoice':
      return { tone: 'busy', statusKey: 'linking' };
    case 'notPro':
      // Linked before: Pro ended. Never linked: signed in without Pro yet.
      return { tone: 'problem', statusKey: linked ? 'profile_paused' : 'profile_needs_pro' };
    case 'ready':
      if (isSyncing) return { tone: 'busy', statusKey: 'status_syncing' };
      if (lastError === 'offline') return { tone: 'problem', statusKey: 'status_offline' };
      if (lastError) return { tone: 'problem', statusKey: 'status_error' };
      return { tone: 'on', statusKey: 'status_on' };
  }
}
