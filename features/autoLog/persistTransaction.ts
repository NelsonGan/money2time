import type { Account, QuickEntryPrefs } from '~/types';

import { autoLogAllowance } from './lib/decide';

/** Synchronous commit shared by both drains; state changes only after it succeeds. */
export function persistAutoLogTransaction(
  options: { isPro: boolean; accounts: readonly Account[]; prefs: QuickEntryPrefs },
  writes: {
    transaction: (write: () => void) => void;
    create: () => void;
    record?: () => void;
    savePrefs: (prefs: QuickEntryPrefs) => void;
  },
): QuickEntryPrefs {
  if (
    autoLogAllowance({
      isPro: options.isPro,
      accounts: options.accounts,
      usedAutoLogs: options.prefs.autoLogUsageCount,
    }) === 0
  ) {
    throw new Error('Auto-log limit reached');
  }
  const next = { ...options.prefs, autoLogUsageCount: options.prefs.autoLogUsageCount + 1 };
  writes.transaction(() => {
    writes.create();
    writes.record?.();
    writes.savePrefs(next);
  });
  return next;
}
