import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time "add your payment QR" nudge shown the first time a user sends a
// receipt without a payment QR attached. Persisted per app user so it never
// nags again once seen.
const QR_PROMPT_STORAGE_PREFIX = 'money2time.settleUp.qrPromptSeen';

function storageKey(appUserId: string) {
  return `${QR_PROMPT_STORAGE_PREFIX}:${appUserId}`;
}

export async function hasSeenQrPrompt(appUserId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(storageKey(appUserId))) === 'true';
  } catch {
    // On a storage read error, treat as seen so we never risk nagging in a loop.
    return true;
  }
}

export async function markQrPromptSeen(appUserId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(appUserId), 'true');
  } catch {
    // Best-effort; a failed write just means the prompt may appear once more.
  }
}

export const settleUpQrPromptStateTestUtils = {
  storageKey,
};
