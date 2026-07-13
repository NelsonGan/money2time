import React, { createContext, useContext, useState } from 'react';

import type { SplitDraft } from '~/features/transactions/components/editor';
import type { Account, AccountGroup, SplitMethod } from '~/types';
import type { formatAmount } from '~/utils/formatters';

/**
 * Everything the pushed Split Bill screen needs to edit the transaction
 * editor's live split draft. The editor publishes this while the route is open;
 * the screen consumes it. Callbacks write straight back into the editor's state,
 * so the two screens stay in sync without duplicating the draft.
 */
export interface SplitBillSession {
  /**
   * Current parent expense amount (already reduced by any paid splits). Acts as
   * the split total for the `even`/`custom` methods; the `items` method derives
   * the total from the rows instead. Edited on the page via {@link onTotalChange}.
   */
  total: number;
  /** How the bill divides — chosen on the page, switchable at any time. */
  method: SplitMethod;
  /** Change the split method (Evenly / Custom / Items). */
  onMethodChange: (method: SplitMethod) => void;
  /** Set the split total (writes back to the parent expense amount). */
  onTotalChange: (total: number) => void;
  /** Receipt "assign items" mode (scanned split): enables claim-by-tap + remove. */
  assignItems: boolean;
  defaultAccountId: string | null;
  splits: SplitDraft[];
  onChange: (splits: SplitDraft[]) => void;
  accounts: Account[];
  accountGroups: AccountGroup[];
  currencySymbol: string;
  formatSettings?: Parameters<typeof formatAmount>[1];
  onMarkPaid?: (splitId: string) => void;
  onMarkUnpaid?: (splitId: string) => void;
  newlyPaidIds: Set<string>;
  /** Commit staged edits (editor keeps them). */
  onDone: () => void;
  /** Discard staged edits back to the snapshot taken when the flow opened. */
  onCancel: () => void;
}

const SplitBillSessionContext = createContext<SplitBillSession | null>(null);
const SetSplitBillSessionContext = createContext<(session: SplitBillSession | null) => void>(
  () => {},
);

export function SplitBillSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SplitBillSession | null>(null);
  return (
    <SetSplitBillSessionContext.Provider value={setSession}>
      <SplitBillSessionContext.Provider value={session}>
        {children}
      </SplitBillSessionContext.Provider>
    </SetSplitBillSessionContext.Provider>
  );
}

/** Read the active split session (null when no split flow is open). */
export function useSplitBillSession(): SplitBillSession | null {
  return useContext(SplitBillSessionContext);
}

/**
 * Publish (or clear) the active split session. The editor uses this; it never
 * reads the session back, so pushing updates can't re-render it into a loop.
 */
export function useSetSplitBillSession(): (session: SplitBillSession | null) => void {
  return useContext(SetSplitBillSessionContext);
}
