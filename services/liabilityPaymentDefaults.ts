import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the pay sheet remembers about the last payment made into a liability
 * (a credit card or a loan): the account it was paid from and, when the
 * borrower wrote one, the note. A card is paid from the same account month
 * after month, so the sheet should open on it rather than on whichever account
 * happens to sort first.
 */
export interface LiabilityPaymentDefaults {
  fromAccountId: string | null;
  /**
   * The note as typed, or null when the borrower left the sheet's own default
   * in place. Null rather than the default's text on purpose: the default names
   * the account, and a remembered copy would go stale the day it is renamed.
   */
  note: string | null;
}

const STORAGE_PREFIX = 'money2time.liabilityPaymentDefaults';

function storageKey(appUserId: string) {
  return `${STORAGE_PREFIX}:${appUserId}`;
}

type DefaultsByLiability = Record<string, LiabilityPaymentDefaults>;

/** Reads the whole map defensively; anything malformed reads as nothing remembered. */
function parseDefaults(value: string | null): DefaultsByLiability {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: DefaultsByLiability = {};
    for (const [liabilityId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { fromAccountId, note } = entry as { fromAccountId?: unknown; note?: unknown };
      result[liabilityId] = {
        fromAccountId: typeof fromAccountId === 'string' ? fromAccountId : null,
        note: typeof note === 'string' && note.length > 0 ? note : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function getLiabilityPaymentDefaults(
  appUserId: string,
  liabilityAccountId: string,
): Promise<LiabilityPaymentDefaults | null> {
  const value = await AsyncStorage.getItem(storageKey(appUserId));
  return parseDefaults(value)[liabilityAccountId] ?? null;
}

export async function rememberLiabilityPaymentDefaults(
  appUserId: string,
  liabilityAccountId: string,
  defaults: LiabilityPaymentDefaults,
): Promise<void> {
  const key = storageKey(appUserId);
  const current = parseDefaults(await AsyncStorage.getItem(key));
  current[liabilityAccountId] = {
    fromAccountId: defaults.fromAccountId,
    note: defaults.note && defaults.note.trim().length > 0 ? defaults.note.trim() : null,
  };
  await AsyncStorage.setItem(key, JSON.stringify(current));
}

export const liabilityPaymentDefaultsTestUtils = { parseDefaults, storageKey };
