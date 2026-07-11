import React, { useEffect, useState } from 'react';

import { useApp } from '~/context/AppContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { consumeScanEditSession } from '~/features/transactions/lib/scanEditBridge';
import { I18n } from '~/lib/i18n';

interface ScanDraftEditScreenProps {
  onClose: () => void;
}

/**
 * Full transaction editor for a single scanned draft. Reuses
 * TransactionEditorScreen (create mode) but, instead of writing a transaction,
 * returns the edited input to the review screen via the session's `onDone`.
 * The receipt is deliberately not handed to the editor — the shared receipt is
 * attached once at Approve time, so the editor never owns (or deletes) it.
 */
export function ScanDraftEditScreen({ onClose }: ScanDraftEditScreenProps) {
  const { isSimpleMode, simpleWalletId } = useApp();
  const [session] = useState(() => consumeScanEditSession());

  // Cold state restore leaves no session → nothing to edit, so close.
  useEffect(() => {
    if (!session) onClose();
  }, [session, onClose]);

  if (!session) return null;

  return (
    <TransactionEditorScreen
      mode="create"
      onClose={onClose}
      onSubmit={(input) => session.onDone(input)}
      initialValues={session.initialValues}
      // Receipts are always expenses; keep splits out of the review path.
      restrictTypeOptions={['expense']}
      hideSplitMode
      hideAccountSelector={isSimpleMode}
      initialAccountId={isSimpleMode ? (simpleWalletId ?? undefined) : undefined}
      titleOverride={I18n.t('receiptScan.edit_row')}
      submitLabelOverride={I18n.t('common.done')}
    />
  );
}
