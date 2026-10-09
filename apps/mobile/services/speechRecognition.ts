/**
 * Web / non-iOS fallback for speech recognition.
 *
 * The real implementation lives in `speechRecognition.native.ts` (iOS).
 * Importing from `~/services/speechRecognition` is safe on any platform; the
 * Metro bundler picks `.native.ts` on iOS/Android and this file elsewhere.
 *
 * Note: even on Android the native implementation exists, but the UI surface
 * for voice input is iOS-only — Android components should gate their entry
 * points with `Platform.OS === 'ios'` checks.
 */
export * from './speechRecognition.shared';
