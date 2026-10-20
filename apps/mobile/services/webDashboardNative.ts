/**
 * The native modules the Web Dashboard needs: the keychain for its link keys
 * and secure randomness (Hermes has no `crypto.getRandomValues`). Kept in its
 * own module and only ever reached through a dynamic import from
 * `webDashboard.native.ts`, so a dev client built before the Web Dashboard,
 * which lacks them, keeps working; the feature just reads as unavailable.
 */

import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export const secureStore = SecureStore;

/** Cryptographically secure random bytes. */
export function randomBytes(length: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(length);
}
