import React, { useCallback } from 'react';

import { useApp } from '~/context/AppContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { type SplitDraft, splitsHelpers } from '~/features/transactions/components/editor';
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
  const { createTransaction, createTransactionWithSplits } = useApp();
  const resolvedInitialAccountId =
    isSimpleMode && simpleWalletId ? simpleWalletId : initialAccountId;
  const restrictedTypes: TransactionType[] | undefined = isSimpleMode
    ? ['expense', 'income']
    : undefined;

  const handleSubmitWithSplits = useCallback(
    (input: CreateTransactionInput, splits: SplitDraft[]) => {
      createTransactionWithSplits(input, splitsHelpers.toSplitDraftInputs(splits, input.accountId));
    },
    [createTransactionWithSplits],
  );

  return (
    <TransactionEditorScreen
      mode="create"
      onClose={onClose}
      onSubmit={createTransaction}
      onSubmitWithSplits={handleSubmitWithSplits}
      onSubmitReady={onSubmitReady}
      restrictTypeOptions={restrictedTypes}
      hideAccountSelector={isSimpleMode}
      initialAccountId={resolvedInitialAccountId}
      initialValues={initialValues}
    />
  );
}
