import React from 'react';

import { TransactionEditorScreen } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';
import type { TransactionType } from '~/types';

interface AddTransactionScreenProps {
  onClose: () => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
  initialAccountId?: string;
}

export function AddTransactionScreen({
  onClose,
  isSimpleMode,
  simpleWalletId,
  initialAccountId,
}: AddTransactionScreenProps) {
  const { createTransaction } = useApp();
  const resolvedInitialAccountId =
    isSimpleMode && simpleWalletId ? simpleWalletId : initialAccountId;
  const restrictedTypes: TransactionType[] | undefined = isSimpleMode
    ? ['expense', 'income']
    : undefined;

  return (
    <TransactionEditorScreen
      mode="create"
      onClose={onClose}
      onSubmit={createTransaction}
      restrictTypeOptions={restrictedTypes}
      hideAccountSelector={isSimpleMode}
      initialAccountId={resolvedInitialAccountId}
    />
  );
}
