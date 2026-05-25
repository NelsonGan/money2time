import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// IMPORTANT: configure in eas.json / .env and inject as EXPO_PUBLIC_*.
// Without a webClientId, GoogleSignin.signIn() will fail at runtime.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID ?? '';

let configured = false;

function configureOnce() {
  if (configured) return;
  GoogleSignin.configure({
    scopes: SCOPES,
    webClientId: WEB_CLIENT_ID || undefined,
    iosClientId: IOS_CLIENT_ID || undefined,
    offlineAccess: false,
  });
  configured = true;
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(WEB_CLIENT_ID);
}

export function isGoogleSignedIn(): boolean {
  configureOnce();
  return GoogleSignin.hasPreviousSignIn();
}

export function getCurrentGoogleUser() {
  configureOnce();
  return GoogleSignin.getCurrentUser();
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
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}

export async function getGoogleAccessToken(): Promise<string | null> {
  configureOnce();
  try {
    if (!GoogleSignin.hasPreviousSignIn()) return null;
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken ?? null;
  } catch {
    return null;
  }
}
