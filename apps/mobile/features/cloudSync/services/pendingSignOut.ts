// Finishes a sign-out whose "this phone no longer counts toward the
// account's Pro" call failed (see cloudSyncSession.ts > PendingSignOut).

import { CloudSyncApiError, signOutSession, unlinkInstall } from './cloudSyncApi';
import { clearPendingSignOut, loadPendingSignOut, savePendingSignOut } from './cloudSyncSession';

let running: Promise<void> | null = null;

function isRejected(error: unknown): boolean {
  return error instanceof CloudSyncApiError && error.code === 'unauthorized';
}

/**
 * Sign-out: unlinks this install from the account, then ends the session.
 * Offline, both wait (the token is kept for the retry) and the user is
 * signed out on the phone all the same.
 */
export async function unlinkAndEndSession(token: string, appUserId: string | null): Promise<void> {
  if (!appUserId) {
    void signOutSession(token).catch(() => undefined);
    return;
  }
  try {
    await unlinkInstall(token, appUserId);
  } catch (error) {
    // A rejected session cannot unlink, and needs no revoking either.
    if (!isRejected(error)) await savePendingSignOut({ token, appUserId });
    return;
  }
  void signOutSession(token).catch(() => undefined);
}

/** Retries a pending unlink. Safe to call often; one run at a time. */
export function finishPendingSignOut(): Promise<void> {
  if (!running) {
    running = (async () => {
      const pending = await loadPendingSignOut();
      if (!pending) return;
      try {
        await unlinkInstall(pending.token, pending.appUserId);
      } catch (error) {
        // Still offline: try again later. A rejected session is done with.
        if (!isRejected(error)) return;
      }
      await clearPendingSignOut();
      void signOutSession(pending.token).catch(() => undefined);
    })()
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
  }
  return running;
}
