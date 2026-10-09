/**
 * Web / non-native fallback for home-screen icon switching.
 *
 * The real implementation lives in `appIcon.native.ts` (iOS + Android).
 * Importing from `~/services/appIcon` is safe on any platform; the Metro
 * bundler picks `.native.ts` on iOS/Android and this file (the shared no-op
 * shims) elsewhere, including the Jest/node test environment.
 */
export * from './appIcon.shared';
