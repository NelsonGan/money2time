/**
 * Native speech-recognition wrapper for iOS (SFSpeechRecognizer) and Android.
 * Uses `expo-speech-recognition` under the hood — no model downloads, no
 * third-party cloud services. iOS performs on-device recognition when the
 * locale supports it, falling back to Apple's own cloud otherwise.
 *
 * Note: native events (result / end / error) are subscribed to from React
 * components via `useSpeechRecognitionEvent` from `expo-speech-recognition`
 * directly. This module only exposes the imperative side (permissions +
 * start/stop) so it can be safely called from non-component contexts.
 *
 * The native module is loaded lazily via `require()` inside each function so
 * that importing this file at app startup doesn't pull in any native code.
 * That keeps the JS bundle resilient on devices where the speech framework
 * fails to initialize (older iOS, locked-down profiles, etc.).
 */
import { Platform } from 'react-native';

import type {
  SpeechRecognitionPermissionResult,
  StartListeningOptions,
} from './speechRecognition.shared';

export type {
  SpeechRecognitionPermissionResult,
  StartListeningOptions,
} from './speechRecognition.shared';

interface ExpoSpeechRecognitionModuleShape {
  getSupportedLocales(options: Record<string, never>): Promise<{ locales: string[] }>;
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
}

let cachedModule: ExpoSpeechRecognitionModuleShape | null = null;
let moduleLoadFailed = false;

function getModule(): ExpoSpeechRecognitionModuleShape | null {
  if (cachedModule) return cachedModule;
  if (moduleLoadFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule: ExpoSpeechRecognitionModuleShape;
    };
    cachedModule = mod.ExpoSpeechRecognitionModule;
    return cachedModule;
  } catch {
    moduleLoadFailed = true;
    return null;
  }
}

// Cache the availability probe across the app lifetime — the probe hits
// the native bridge and the result doesn't change between calls. Multiple
// screens (App.tsx, QuickAddScreen.tsx, QuickEntrySettingsScreen.tsx) all
// query availability on mount, so this dedupes them to one native call.
let availabilityCache: Promise<boolean> | null = null;

export async function isSpeechRecognitionAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (availabilityCache) return availabilityCache;
  const mod = getModule();
  if (!mod) return false;
  availabilityCache = (async () => {
    try {
      const result = await mod.getSupportedLocales({});
      const locales = (result?.locales ?? []) as string[];
      return locales.length > 0;
    } catch {
      return false;
    }
  })();
  return availabilityCache;
}

export async function getSpeechPermissions(): Promise<SpeechRecognitionPermissionResult> {
  const mod = getModule();
  if (!mod) return { granted: false, canAskAgain: true };
  try {
    const result = await mod.getPermissionsAsync();
    return {
      granted: result.granted,
      canAskAgain: result.canAskAgain ?? true,
    };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export async function requestSpeechPermissions(): Promise<SpeechRecognitionPermissionResult> {
  const mod = getModule();
  if (!mod) return { granted: false, canAskAgain: false };
  try {
    const result = await mod.requestPermissionsAsync();
    return {
      granted: result.granted,
      canAskAgain: result.canAskAgain ?? true,
    };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

export function startListening(options: StartListeningOptions = {}): void {
  const mod = getModule();
  if (!mod) return;
  try {
    mod.start({
      lang: options.lang ?? 'en-US',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
    });
  } catch {
    // ignore — the caller will see the missing transcript and can retry
  }
}

export function stopListening(): void {
  const mod = getModule();
  if (!mod) return;
  try {
    mod.stop();
  } catch {
    // stopping an already-stopped session is a noop
  }
}

export function abortListening(): void {
  const mod = getModule();
  if (!mod) return;
  try {
    mod.abort();
  } catch {
    // ignore
  }
}
