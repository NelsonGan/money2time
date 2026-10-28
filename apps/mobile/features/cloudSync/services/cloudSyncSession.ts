// The signed-in Cloud Sync account, kept in the keychain / keystore. The
// session token never goes in the database or a backup.

import AsyncStorage from '@react-native-async-storage/async-storage';
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

// The account this phone's data was last linked to, kept when a session
// expires (and cleared on sign-out), so signing in again to the same account
// carries on instead of linking afresh. Not secret: an id, in AsyncStorage.

const LAST_LINKED_KEY = 'm2t.cloudSync.lastLinkedUser';

export async function getLastLinkedUser(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_LINKED_KEY).catch(() => null);
}

export async function setLastLinkedUser(userId: string | null): Promise<void> {
  await (
    userId
      ? AsyncStorage.setItem(LAST_LINKED_KEY, userId)
      : AsyncStorage.removeItem(LAST_LINKED_KEY)
  ).catch(() => undefined);
}

// A sign-out whose "this phone no longer counts toward the account's Pro"
// call could not reach the Worker (offline). Kept in the keychain (it holds
// the old session token) and retried at launch, on return to the app and
// before the next sign-in, so an account does not stay Pro for whoever signs
// in to it next. The Worker's 30-day check-in window is the backstop.

const PENDING_SIGN_OUT_KEY = 'm2t.cloudSync.pendingSignOut.v1';

export interface PendingSignOut {
  token: string;
  appUserId: string;
}

export async function loadPendingSignOut(): Promise<PendingSignOut | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_SIGN_OUT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PendingSignOut>) : null;
    return parsed?.token && parsed.appUserId
      ? { token: parsed.token, appUserId: parsed.appUserId }
      : null;
  } catch {
    return null;
  }
}

export async function savePendingSignOut(pending: PendingSignOut): Promise<void> {
  await SecureStore.setItemAsync(PENDING_SIGN_OUT_KEY, JSON.stringify(pending), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
}

export async function clearPendingSignOut(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_SIGN_OUT_KEY).catch(() => undefined);
}
