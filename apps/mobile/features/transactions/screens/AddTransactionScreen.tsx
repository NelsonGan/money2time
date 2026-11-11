import React, { useCallback, useMemo } from 'react';

import { useApp } from '~/context/AppContext';
import {
  DEFAULT_INSTALMENT_CHOICE,
  type InstalmentChoice,
} from '~/features/instalments/components/InstalmentSheet';
import { useCanStartInstalmentPlan } from '~/features/instalments/hooks/useCanStartInstalmentPlan';
import { scheduleOfFrequency } from '~/features/instalments/lib/instalmentPlan';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { type SplitDraft, splitsHelpers } from '~/features/transactions/components/editor';
import type { TransactionEditorSubmitExtras } from '~/features/transactions/components/TransactionEditorScreen';
import { useNewTransactionGate } from '~/features/transactions/hooks/useNewTransactionGate';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';

import { TransactionEntryBlockedScreen } from './TransactionEntryBlockedScreen';

interface AddTransactionScreenProps {
  onClose: () => void;
  onSubmitReady?: (input: CreateTransactionInput) => void;
  initialAccountId?: string;
  initialValues?: AddTransactionInitialValues;
  /** Open the Split Bill sheet on mount (used for the manual-split add flow). */
  openSplitBillOnMount?: boolean;
  /** Start with "pay in instalments" on. */
  startInstalmentPlan?: boolean;
}

export function AddTransactionScreen({
  onClose,
  onSubmitReady,
  initialAccountId,
  initialValues,
  openSplitBillOnMount,
  startInstalmentPlan = false,
}: AddTransactionScreenProps) {
  const { createTransaction, createTransactionWithSplits, markSplitPaid, createInstalmentPlan } =
    useApp();
  const { blocked, activeAccountCount } = useNewTransactionGate();
  const canStartPlan = useCanStartInstalmentPlan();

  // "Pay in instalments": the form's amount is the total and its date the
  // first payment. The plan keeps the note as its name and hands the receipt,
  // reimbursement tick, longer note and mood to the first payment (the editor
  // only allows a receipt or the tick when that payment is made today).
  const instalmentOptions = useMemo(
    () => ({
      initialChoice: startInstalmentPlan ? DEFAULT_INSTALMENT_CHOICE : null,
      canStart: canStartPlan,
      onSubmitPlan: ({
        transaction,
        choice,
      }: {
        transaction: CreateTransactionInput;
        choice: InstalmentChoice;
      }) => {
        if (!transaction.accountId || !transaction.categoryId) return;
        const { pattern, interval } = scheduleOfFrequency(choice.frequency);
        const created = createInstalmentPlan({
          name: transaction.note?.trim() || '',
          total: transaction.amount,
          count: choice.count,
          currency: transaction.currency,
          accountId: transaction.accountId,
          categoryId: transaction.categoryId,
          note: transaction.note ?? null,
          recurrencePattern: pattern,
          recurrenceInterval: interval,
          startDate: transaction.date,
          regularAmount: choice.amount ?? null,
          memberId: transaction.memberId,
          firstPayment: {
            details: transaction.details ?? null,
            receiptUri: transaction.receiptUri ?? null,
            sentiment: transaction.sentiment,
            reimbursable: transaction.reimbursable ?? false,
          },
        });
        if (created?.firstPaymentId) requestHighlightTransaction(created.firstPaymentId);
      },
    }),
    [canStartPlan, createInstalmentPlan, startInstalmentPlan],
  );

  // Create the transaction and briefly flash its row so the user can spot the
  // one they just added once the list lands on its day.
  const handleCreate = useCallback(
    (input: CreateTransactionInput, extras?: TransactionEditorSubmitExtras) => {
      const id = createTransaction(
        input,
        extras?.transferFee ? { transferFee: extras.transferFee } : undefined,
      );
      requestHighlightTransaction(id);
    },
    [createTransaction],
  );

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

  if (blocked) {
    return (
      <TransactionEntryBlockedScreen activeAccountCount={activeAccountCount} onClose={onClose} />
    );
  }

  return (
    <TransactionEditorScreen
      mode="create"
      onClose={onClose}
      onSubmit={handleCreate}
      onSubmitWithSplits={handleSubmitWithSplits}
      onSubmitReady={onSubmitReady}
      initialAccountId={initialAccountId}
      initialValues={initialValues}
      openSplitBillOnMount={openSplitBillOnMount}
      instalmentOptions={instalmentOptions}
    />
  );
}
