// The Cloud Sync state the Settings profile card's pill shows.

import type { CloudSyncErrorKind, CloudSyncStatus } from '../CloudSyncContext';

/**
 * `on` synced and healthy, `busy` a sync or the first link in progress,
 * `action` waiting for the user, `off` signed out, `problem` offline, failed,
 * paused or signed out by the app.
 */
export type ProfileSyncTone = 'on' | 'busy' | 'action' | 'off' | 'problem';

/** The `cloud_sync.` strings the pill can show after "Cloud Sync". */
export type ProfileSyncStatusKey =
  | 'profile_off'
  | 'profile_paused'
  | 'profile_needs_pro'
  | 'linking'
  | 'choice_title'
  | 'status_on'
  | 'status_syncing'
  | 'status_offline'
  | 'status_error';

export interface ProfileSyncState {
  tone: ProfileSyncTone;
  /** Key under `cloud_sync.` for the short status after "Cloud Sync", or null for none. */
  statusKey: ProfileSyncStatusKey | null;
}

export interface ProfileSyncInput {
  status: CloudSyncStatus;
  isSyncing: boolean;
  lastError: CloudSyncErrorKind | null;
  linked: boolean;
  /** Pro, but this phone is past the account's phone limit. */
  phoneLimited: boolean;
}

/** Null when the pill is hidden (a build without Cloud Sync). */
export function profileSyncState({
  status,
  isSyncing,
  lastError,
  linked,
  phoneLimited,
}: ProfileSyncInput): ProfileSyncState | null {
  switch (status) {
    case 'unavailable':
      return null;
    case 'loading':
      // The first sync after launch or sign-in runs before `ready`.
      return isSyncing
        ? { tone: 'busy', statusKey: 'status_syncing' }
        : { tone: 'off', statusKey: null };
    case 'signedOut':
      // An error here means the app signed the user out (session expired,
      // link failed), not the user.
      return { tone: lastError ? 'problem' : 'off', statusKey: 'profile_off' };
    case 'linking':
      // Linking waits for the network while offline.
      return lastError === 'offline'
        ? { tone: 'problem', statusKey: 'status_offline' }
        : { tone: 'busy', statusKey: 'linking' };
    case 'needsChoice':
      return { tone: 'action', statusKey: 'choice_title' };
    case 'notPro':
      // Past the phone limit or linked before: paused. Never linked: needs Pro.
      return {
        tone: 'problem',
        statusKey: phoneLimited || linked ? 'profile_paused' : 'profile_needs_pro',
      };
    case 'ready':
      if (isSyncing) return { tone: 'busy', statusKey: 'status_syncing' };
      if (lastError === 'offline') return { tone: 'problem', statusKey: 'status_offline' };
      if (lastError) return { tone: 'problem', statusKey: 'status_error' };
      return { tone: 'on', statusKey: 'status_on' };
  }
}
