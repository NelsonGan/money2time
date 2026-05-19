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
  const { createTransaction, createTransactionWithSplits, markSplitPaid } = useApp();
  const resolvedInitialAccountId =
    isSimpleMode && simpleWalletId ? simpleWalletId : initialAccountId;
  const restrictedTypes: TransactionType[] | undefined = isSimpleMode
    ? ['expense', 'income']
    : undefined;

  const handleSubmitWithSplits = useCallback(
    (input: CreateTransactionInput, splits: SplitDraft[]) => {
      // Stage the locally-marked-paid friends so we can flush them via
      // markSplitPaid AFTER the parent + splits are created. This mirrors
      // EditTransactionScreen — the markSplitPaid path is the one that
      // correctly reduces the parent amount, creates the payback transfer for
      // cross-account paybacks, and writes paidAt/paidTransactionId.
      const pendingMarkPaid: { id: string; paybackAccountId: string | null }[] = [];
      splits.forEach((s) => {
        if (!s.id || s.isSelf || !s.paid) return;
        pendingMarkPaid.push({
          id: s.id,
          paybackAccountId: s.paybackAccountId ?? input.accountId ?? null,
        });
      });

      // Editor `input.amount` has already been reduced by each Mark Paid
      // toggle. Reconstruct the original bill total (sum of every split,
      // paid and unpaid) so the parent starts at the full amount; markSplitPaid
      // will then back the paid splits out, matching EDIT mode's final state.
      const originalTotal = splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

      // Drop the local `paid` flag so createTransactionWithSplits inserts
      // every split unpaid. The markSplitPaid calls below flip the paid ones.
      const unpaidDrafts = splits.map((s) => ({ ...s, paid: undefined }));

      createTransactionWithSplits(
        { ...input, amount: originalTotal },
        splitsHelpers.toSplitDraftInputs(unpaidDrafts, input.accountId),
      );

      pendingMarkPaid.forEach(({ id, paybackAccountId }) => {
        markSplitPaid(id, { paybackAccountId });
      });
    },
    [createTransactionWithSplits, markSplitPaid],
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
