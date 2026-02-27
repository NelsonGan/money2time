import React from 'react';

import { TransactionEditorScreen } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';

interface AddTransactionScreenProps {
  onClose: () => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
}

export function AddTransactionScreen({ onClose, isSimpleMode, simpleWalletId }: AddTransactionScreenProps) {
  const { createTransaction } = useApp();

  return (
    <TransactionEditorScreen
      mode="create"
      onClose={onClose}
      onSubmit={createTransaction}
      restrictTypeOptions={isSimpleMode ? ['expense', 'income'] : undefined}
      hideAccountSelector={isSimpleMode}
      initialAccountId={isSimpleMode && simpleWalletId ? simpleWalletId : undefined}
    />
  );
}
