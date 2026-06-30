/**
 * Storage-backed wrapper for the cloud-backup opt-in prompt state.
 *
 * Pure eligibility logic lives in `./cloudBackupPrompt.shared.ts` for
 * testability; this module owns the AsyncStorage read/modify/write so the
 * shown-count and cadence survive restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CLOUD_BACKUP_PROMPT_STORAGE_KEY,
  type CloudBackupPromptState,
  createInitialState,
  markShown,
  parseStoredState,
} from '~/services/cloudBackupPrompt.shared';

export * from '~/services/cloudBackupPrompt.shared';

let cache: CloudBackupPromptState | null = null;
let hydrating: Promise<CloudBackupPromptState> | null = null;
// Serializes read-modify-write so concurrent record calls can't clobber the
// shown count.
let updateChain: Promise<unknown> = Promise.resolve();

async function hydrate(): Promise<CloudBackupPromptState> {
  if (cache) return cache;
  if (hydrating) return hydrating;

  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(CLOUD_BACKUP_PROMPT_STORAGE_KEY);
      cache = parseStoredState(raw) ?? createInitialState();
    } catch {
      cache = createInitialState();
    } finally {
      hydrating = null;
    }
    return cache;
  })();

  return hydrating;
}

async function persist(state: CloudBackupPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOUD_BACKUP_PROMPT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: an unwritten state just means the prompt may show again sooner.
  }
}

export async function getCloudBackupPromptState(): Promise<CloudBackupPromptState> {
  return hydrate();
}

/** Stamp that the prompt was shown: increments the count and records the time. */
export function recordCloudBackupPromptShown(): Promise<CloudBackupPromptState> {
  const result = updateChain.then(async () => {
    const current = await hydrate();
    const next = markShown(current, new Date());
    cache = next;
    void persist(next);
    return next;
  });
  updateChain = result.catch(() => undefined);
  return result;
}

/**
 * Dev-only: wipe the persisted shown-count / cadence state so the prompt becomes
 * eligible again on the next transaction. Serialized through the same chain as
 * `recordCloudBackupPromptShown` so it can't race a concurrent write.
 */
export function resetCloudBackupPromptState(): Promise<void> {
  const result = updateChain.then(async () => {
    cache = createInitialState();
    try {
      await AsyncStorage.removeItem(CLOUD_BACKUP_PROMPT_STORAGE_KEY);
    } catch {
      // Non-fatal: the in-memory cache reset already re-arms it for this session.
    }
  });
  updateChain = result.catch(() => undefined);
  return result;
}
