import React from 'react';

import { TransactionEditorScreen } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import type { TransactionType } from '~/types';

interface AddTransactionScreenProps {
  onClose: () => void;
  onSubmitReady?: (input: CreateTransactionInput) => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
  initialAccountId?: string;
  initialValues?: AddTransactionInitialValues;
}

export function AddTransactionScreen({
  onClose,
  onSubmitReady,
  isSimpleMode,
  simpleWalletId,
  initialAccountId,
  initialValues,
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
      onSubmitReady={onSubmitReady}
      restrictTypeOptions={restrictedTypes}
      hideAccountSelector={isSimpleMode}
      initialAccountId={resolvedInitialAccountId}
      initialValues={initialValues}
    />
  );
}
