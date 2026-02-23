import React from 'react';

import { TransactionEditorScreen } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';

interface AddTransactionScreenProps {
  onClose: () => void;
}

export function AddTransactionScreen({ onClose }: AddTransactionScreenProps) {
  const { createTransaction } = useApp();

  return <TransactionEditorScreen mode="create" onClose={onClose} onSubmit={createTransaction} />;
}
