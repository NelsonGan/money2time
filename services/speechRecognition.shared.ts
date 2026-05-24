/**
 * Cross-platform speech recognition surface.
 *
 * The real implementation lives in `speechRecognition.native.ts` and wraps
 * `expo-speech-recognition`. Web and any platform without the native module
 * gets the no-op shims below.
 */

export interface StartListeningOptions {
  /** BCP-47 language tag, e.g. 'en-US', 'zh-CN'. */
  lang?: string;
}

export interface SpeechRecognitionPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

// Default no-op implementations — overridden by the .native.ts module on iOS/Android.
export const isSpeechRecognitionAvailable = async (): Promise<boolean> => false;

export const requestSpeechPermissions = async (): Promise<SpeechRecognitionPermissionResult> => ({
  granted: false,
  canAskAgain: false,
});

export const getSpeechPermissions = async (): Promise<SpeechRecognitionPermissionResult> => ({
  granted: false,
  canAskAgain: true,
});

export const startListening = (_options?: StartListeningOptions): void => {
  // no-op on unsupported platforms
};

export const stopListening = (): void => {
  // no-op on unsupported platforms
};

export const abortListening = (): void => {
  // no-op on unsupported platforms
};
