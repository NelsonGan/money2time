import type { TransactionWithRelations } from '~/types';

type TransactionType = TransactionWithRelations['type'];

/** One activation per session, claimed only by a successful expense/income save. */
export function createFirstTransactionSignal() {
  let hasLoggedEntry: boolean | null = null;
  return {
    prepare(type: TransactionType, history: readonly { type: TransactionType }[]): () => boolean {
      if (type !== 'expense' && type !== 'income') return () => false;
      // Capture history before the first optimistic insert. Overlapping saves
      // must not treat each other's uncommitted rows as existing history.
      hasLoggedEntry ??= history.some((tx) => tx.type === 'expense' || tx.type === 'income');
      return () => {
        if (hasLoggedEntry) return false;
        hasLoggedEntry = true;
        return true;
      };
    },
  };
}
