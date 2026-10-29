import { profileSyncState } from '~/features/cloudSync/lib/profileStatus';
import en from '~/lib/i18n/locales/en';

const base = { isSyncing: false, lastError: null, linked: false, phoneLimited: false } as const;

describe('profileSyncState', () => {
  it('hides the pill in a build without Cloud Sync', () => {
    expect(profileSyncState({ ...base, status: 'unavailable' })).toBeNull();
  });

  it('shows the label alone while loading, and Off when signed out', () => {
    expect(profileSyncState({ ...base, status: 'loading' })).toEqual({
      tone: 'off',
      statusKey: null,
    });
    expect(profileSyncState({ ...base, status: 'signedOut' })).toEqual({
      tone: 'off',
      statusKey: 'profile_off',
    });
  });

  it('shows a first sync that runs while loading', () => {
    expect(profileSyncState({ ...base, status: 'loading', isSyncing: true })).toEqual({
      tone: 'busy',
      statusKey: 'status_syncing',
    });
  });

  it('marks a sign-out the app made', () => {
    expect(
      profileSyncState({ ...base, status: 'signedOut', lastError: 'session_expired' }),
    ).toEqual({ tone: 'problem', statusKey: 'profile_off' });
  });

  it('shows setting up while linking, offline when linking waits for the network', () => {
    expect(profileSyncState({ ...base, status: 'linking' })).toEqual({
      tone: 'busy',
      statusKey: 'linking',
    });
    expect(profileSyncState({ ...base, status: 'linking', lastError: 'offline' })).toEqual({
      tone: 'problem',
      statusKey: 'status_offline',
    });
  });

  it('asks for the choice instead of looking busy', () => {
    expect(profileSyncState({ ...base, status: 'needsChoice' })).toEqual({
      tone: 'action',
      statusKey: 'choice_title',
    });
  });

  it('does not ask a Pro account past the phone limit to get Pro', () => {
    expect(profileSyncState({ ...base, status: 'notPro', phoneLimited: true })?.statusKey).toBe(
      'profile_paused',
    );
  });

  it('tells a paused account from one that never had Pro', () => {
    expect(profileSyncState({ ...base, status: 'notPro', linked: true })?.statusKey).toBe(
      'profile_paused',
    );
    expect(profileSyncState({ ...base, status: 'notPro', linked: false })?.statusKey).toBe(
      'profile_needs_pro',
    );
  });

  it('follows the sync while signed in', () => {
    expect(profileSyncState({ ...base, status: 'ready' })).toEqual({
      tone: 'on',
      statusKey: 'status_on',
    });
    expect(profileSyncState({ ...base, status: 'ready', isSyncing: true })?.statusKey).toBe(
      'status_syncing',
    );
    expect(profileSyncState({ ...base, status: 'ready', lastError: 'offline' })?.statusKey).toBe(
      'status_offline',
    );
    expect(profileSyncState({ ...base, status: 'ready', lastError: 'server' })).toEqual({
      tone: 'problem',
      statusKey: 'status_error',
    });
  });

  it('only names keys that exist in English', () => {
    const strings = (en as unknown as { cloud_sync: Record<string, unknown> }).cloud_sync;
    const inputs = [
      { ...base, status: 'signedOut' },
      { ...base, status: 'linking' },
      { ...base, status: 'linking', lastError: 'offline' },
      { ...base, status: 'needsChoice' },
      { ...base, status: 'loading', isSyncing: true },
      { ...base, status: 'notPro', linked: true },
      { ...base, status: 'notPro' },
      { ...base, status: 'ready' },
      { ...base, status: 'ready', isSyncing: true },
      { ...base, status: 'ready', lastError: 'offline' },
      { ...base, status: 'ready', lastError: 'unknown' },
    ] as const;
    for (const input of inputs) {
      const key = profileSyncState(input)?.statusKey;
      expect(typeof strings[key as string]).toBe('string');
    }
  });
});
