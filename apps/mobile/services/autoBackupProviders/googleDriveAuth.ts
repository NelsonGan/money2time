import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// IMPORTANT: configure in eas.json / .env and inject as EXPO_PUBLIC_*.
// Without a webClientId, GoogleSignin.signIn() will fail at runtime.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID ?? '';

/** The scopes the SDK is configured with now, or null before the first call. */
let configuredFor: 'drive' | 'sign_in' | null = null;

/**
 * Configures the Google SDK, with the Drive scope by default. Cloud Sync
 * sign-in asks for `sign_in` (no Drive scope, so no Drive consent screen).
 */
function configureOnce(purpose: 'drive' | 'sign_in' = 'drive') {
  if (configuredFor === purpose) return;
  GoogleSignin.configure({
    ...(purpose === 'drive' ? { scopes: SCOPES } : {}),
    webClientId: WEB_CLIENT_ID || undefined,
    iosClientId: IOS_CLIENT_ID || undefined,
    offlineAccess: false,
  });
  configuredFor = purpose;
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(WEB_CLIENT_ID);
}

// Deliberately not exported: `hasPreviousSignIn()` and `getCurrentUser()` are
// tempting as a "is Drive connected?" check but neither answers it. The first
// stays true for a remembered account with no usable session, the second is
// empty until the session is restored. Use `ensureGoogleSession()` /
// `getGoogleAccountEmail()` below instead.

// The native SDK holds the signed-in account in memory only
// (`GIDSignIn.sharedInstance.currentUser` on iOS). `hasPreviousSignIn()` reads
// the persisted keychain/account record, so it keeps returning true across app
// launches, but `getTokens()` rejects with "getTokens requires a user to be
// signed in" until the in-memory session is rebuilt. `signInSilently()` is what
// rebuilds it (it calls `restorePreviousSignIn` natively).
//
// Without this restore, every backup after the first app restart saw a null
// access token, reported the Drive provider as unavailable, and silently fell
// back to a local backup.
let restorePromise: Promise<boolean> | null = null;

export async function ensureGoogleSession(opts?: { force?: boolean }): Promise<boolean> {
  configureOnce();
  if (!opts?.force && GoogleSignin.getCurrentUser()) return true;
  if (!GoogleSignin.hasPreviousSignIn()) return false;

  // Dedupe concurrent restores — the settings screen, `listAllBackups` and a
  // backup run can all ask at the same time, and each `signInSilently()` is a
  // native round-trip.
  if (!restorePromise) {
    const promise = (async () => {
      try {
        const result = await GoogleSignin.signInSilently();
        return result.type === 'success';
      } catch {
        // Revoked access, expired refresh token, offline. The caller falls
        // back; an interactive sign-in is needed to recover.
        return false;
      }
    })();
    restorePromise = promise;
    void promise.finally(() => {
      if (restorePromise === promise) restorePromise = null;
    });
  }
  return restorePromise;
}

export async function getGoogleAccountEmail(): Promise<string | null> {
  if (!(await ensureGoogleSession())) return null;
  return GoogleSignin.getCurrentUser()?.user.email ?? null;
}

export async function signInWithGoogle(): Promise<
  | { ok: true; email: string | null }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string }
> {
  configureOnce();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type === 'success') {
      return { ok: true, email: result.data.user.email ?? null };
    }
    return { ok: false, reason: 'cancelled' };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, reason: 'cancelled' };
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { ok: false, reason: 'unavailable', message: 'Google Play Services unavailable' };
    }
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function signOutFromGoogle(): Promise<void> {
  configureOnce();
  restorePromise = null;
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}

/**
 * Drops a token the native SDK is still handing out after Drive has rejected
 * it. `getTokens()` caches aggressively, so without this every retry re-sends
 * the same dead token and the backup fails with "Request had invalid
 * authentication credentials".
 */
export async function clearGoogleTokenCache(token: string): Promise<void> {
  try {
    await GoogleSignin.clearCachedAccessToken(token);
  } catch {
    // Nothing to clear, or the session is already gone.
  }
}

export async function getGoogleAccessToken(): Promise<string | null> {
  if (!(await ensureGoogleSession())) return null;
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken ?? null;
  } catch {
    // The restored session was rejected while refreshing (token revoked on the
    // Google side, password change). Force one more restore before giving up.
    if (!(await ensureGoogleSession({ force: true }))) return null;
    try {
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken ?? null;
    } catch {
      return null;
    }
  }
}

export type GoogleIdTokenResult =
  | { ok: true; idToken: string }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string };

/**
 * A fresh Google ID token for Cloud Sync sign-in. The Google SDK holds one
 * signed-in account, shared with Drive backup:
 * - Already signed in for Drive: restore that session and use its ID token.
 * - Otherwise: sign in once without the Drive scope (no Drive consent screen),
 *   take the token, and sign out again so Drive backup still asks for its own
 *   access when the user turns it on.
 */
export async function getGoogleIdToken(): Promise<GoogleIdTokenResult> {
  if (!WEB_CLIENT_ID) return { ok: false, reason: 'unavailable', message: 'not configured' };
  configureOnce();
  const hadDriveAccount = GoogleSignin.hasPreviousSignIn();
  if (await ensureGoogleSession({ force: true })) {
    try {
      const tokens = await GoogleSignin.getTokens();
      if (tokens.idToken) return { ok: true, idToken: tokens.idToken };
    } catch {
      // Fall through to an interactive sign-in.
    }
  }
  // A Drive account is remembered but could not be restored (offline, token
  // refresh): stop here rather than sign it out below and disconnect backups.
  if (hadDriveAccount) {
    return { ok: false, reason: 'error', message: 'google session unavailable' };
  }
  configureOnce('sign_in');
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') return { ok: false, reason: 'cancelled' };
    const idToken = result.data.idToken;
    if (!idToken) return { ok: false, reason: 'error', message: 'no id token' };
    return { ok: true, idToken };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { ok: false, reason: 'unavailable', message: 'Google Play Services unavailable' };
    }
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  } finally {
    await GoogleSignin.signOut().catch(() => undefined);
    restorePromise = null;
  }
}
