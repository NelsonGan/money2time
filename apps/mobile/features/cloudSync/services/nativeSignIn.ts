// Native Apple and Google sign-in, returning ID tokens for the Worker.

import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { getGoogleIdToken } from '~/services/autoBackupProviders/googleDriveAuth';

export type NativeProvider = 'apple' | 'google';

type NativeSignInResult =
  | {
      ok: true;
      provider: NativeProvider;
      idToken: string;
      nonce?: string;
      /** Apple only: one-time code the Worker trades for a token to revoke on deletion. */
      authorizationCode?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string };

/** Apple sign-in needs iOS and a build with the Sign in with Apple entitlement. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (Constants.expoConfig?.ios?.usesAppleSignIn !== true) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

async function signInWithApple(): Promise<NativeSignInResult> {
  // Apple puts the SHA-256 of the nonce in the token; the Worker gets the raw
  // nonce and checks the hash, so a token cannot be replayed into another sign-in.
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { ok: false, reason: 'error', message: 'no token' };
    return {
      ok: true,
      provider: 'apple',
      idToken: credential.identityToken,
      nonce,
      authorizationCode: credential.authorizationCode,
      firstName: credential.fullName?.givenName ?? null,
      lastName: credential.fullName?.familyName ?? null,
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

async function signInWithGoogle(): Promise<NativeSignInResult> {
  const result = await getGoogleIdToken();
  if (!result.ok) return result;
  return { ok: true, provider: 'google', idToken: result.idToken };
}

export function isGoogleSignInAvailable(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID);
}

/** Every native provider: whether this phone offers it, and how it signs in. */
export const NATIVE_PROVIDERS: Record<
  NativeProvider,
  { isAvailable: () => Promise<boolean>; signIn: () => Promise<NativeSignInResult> }
> = {
  apple: { isAvailable: isAppleSignInAvailable, signIn: signInWithApple },
  google: { isAvailable: async () => isGoogleSignInAvailable(), signIn: signInWithGoogle },
};
