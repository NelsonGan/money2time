import type { Account, QuickEntryPrefs } from '~/types';

import { autoLogAllowance } from './lib/decide';

/**
 * The free tier's automatic logs are used up. An expected state, not a fault:
 * the entry stays queued (it posts if the user upgrades) and is not reported.
 */
export class AutoLogLimitError extends Error {
  constructor() {
    super('Auto-log limit reached');
    this.name = 'AutoLogLimitError';
  }
}

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
    throw new AutoLogLimitError();
  }
  const next = { ...options.prefs, autoLogUsageCount: options.prefs.autoLogUsageCount + 1 };
  writes.transaction(() => {
    writes.create();
    writes.record?.();
    writes.savePrefs(next);
  });
  return next;
}
