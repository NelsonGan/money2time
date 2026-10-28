// Pro through the Cloud Sync account. See README.md > Cloud Sync > Pro on
// every signed-in phone.
//
// Each install has its own RevenueCat App User ID, so a purchase on one phone
// does not make another phone Pro, and a store Restore on a second phone moves
// the purchase there (RevenueCat transfers it), leaving the first phone free.
// The Worker treats the *account* as Pro while any install that signed in to
// it is Pro. This store keeps the Worker's last answer for the signed-in
// account, and ProContext counts it as Pro beside the store's own answer.
//
// The answer is kept in AsyncStorage so an offline launch keeps it, for at
// most OFFLINE_GRACE_MS without a fresh answer. Signing out clears it.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'm2t.cloudSync.accountPro';
/** A Pro answer still counts this long without a fresh one (offline). */
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccountProAnswer {
  userId: string;
  isPro: boolean;
  checkedAt: number;
}

let answer: AccountProAnswer | null = null;
let loaded = false;
/** Set or cleared since launch: the stored copy is older and must not win. */
let written = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isAnswer(value: unknown): value is AccountProAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === 'string' && typeof v.isPro === 'boolean' && typeof v.checkedAt === 'number'
  );
}

const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    // A write (or a clear) that landed while reading wins.
    if (written) return;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    answer = isAnswer(parsed) ? parsed : null;
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    notify();
  });

export function subscribeAccountPro(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the stored answer has been read (or failed to read) at launch. */
export function isAccountProLoaded(): boolean {
  return loaded;
}

export function waitForAccountPro(): Promise<void> {
  return loading;
}

/** Whether `stored` still makes this phone Pro at `now`. */
export function accountProActive(stored: AccountProAnswer | null, now: number): boolean {
  return !!stored?.isPro && now - stored.checkedAt < OFFLINE_GRACE_MS && stored.checkedAt <= now;
}

/** The last answer, whatever its age. */
export function getAccountProAnswer(): AccountProAnswer | null {
  return answer;
}

/** Whether the signed-in account makes this phone Pro now. */
export function isAccountPro(): boolean {
  return accountProActive(answer, Date.now());
}

export function setAccountPro(userId: string, isPro: boolean): void {
  written = true;
  const previous = answer;
  answer = { userId, isPro, checkedAt: Date.now() };
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(answer)).catch(() => undefined);
  if (previous?.isPro !== isPro || previous.userId !== userId) notify();
}

/** Signed out, or another account signed in: the account's Pro no longer applies. */
export function clearAccountPro(): void {
  written = true;
  const had = answer !== null;
  answer = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  if (had) notify();
}
