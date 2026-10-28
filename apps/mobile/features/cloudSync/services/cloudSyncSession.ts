// The signed-in Cloud Sync account, kept in the keychain / keystore. The
// session token never goes in the database or a backup.

import * as SecureStore from 'expo-secure-store';

import type { CloudUser } from './cloudSyncApi';

const KEY = 'm2t.cloudSync.session.v1';

export interface StoredSession {
  token: string;
  user: CloudUser;
  /** Set once this phone's data and the cloud copy have been brought together. */
  linked: boolean;
}

let cached: StoredSession | null | undefined;

export async function loadSession(): Promise<StoredSession | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
    cached = parsed?.token && parsed.user?.id ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveSession(session: StoredSession): Promise<void> {
  cached = session;
  await SecureStore.setItemAsync(KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
