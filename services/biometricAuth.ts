/**
 * Web / non-native fallback for biometric authentication.
 *
 * The real implementation lives in `biometricAuth.native.ts` (iOS + Android).
 * Importing from `~/services/biometricAuth` is safe on any platform; the Metro
 * bundler picks `.native.ts` on iOS/Android and this file (the shared no-op
 * shims) elsewhere, including the Jest/node test environment.
 */
export * from './biometricAuth.shared';
