import React, { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import { useApp } from '~/context/AppContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { type SplitDraft, splitsHelpers } from '~/features/transactions/components/editor';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { TransactionType, TransactionWithRelations } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';
import { dayKeyFromIsoLocal } from '~/utils/formatters';

interface EditTransactionScreenProps {
  transaction: TransactionWithRelations;
  onClose: () => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
  /** Open the Split Bill modal automatically when the editor mounts. Set by
   *  callers (e.g. activity list) when the tapped row has unpaid splits. */
  openSplitBillOnMount?: boolean;
}

export function EditTransactionScreen({
  transaction,
  onClose,
  isSimpleMode,
  simpleWalletId,
  openSplitBillOnMount,
}: EditTransactionScreenProps) {
  const {
    updateTransaction,
    updateTransactionSplits,
    deleteTransaction,
    markSplitPaid,
    markSplitUnpaid,
    markReimbursed,
  } = useApp();
  const isLegacyBalanceAdjustmentTransfer =
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId;
  const isBalanceAdjustment =
    transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer;
  const initialAccountId = isSimpleMode && simpleWalletId ? simpleWalletId : undefined;
  const restrictedTypes = useMemo<TransactionType[] | undefined>(
    () =>
      isBalanceAdjustment
        ? ['balance_adjustment']
        : isSimpleMode
          ? ['expense', 'income']
          : undefined,
    [isBalanceAdjustment, isSimpleMode],
  );

  const handleDelete = useCallback(() => {
    Alert.alert(
      I18n.t('transactions.editor.delete_transaction'),
      I18n.t('transactions.editor.delete_confirm'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            try {
              deleteTransaction(transaction.id);
              onClose();
            } catch (error) {
              Alert.alert(getErrorMessage(error, I18n.t('errors.generic_operation_failed')));
            }
          },
        },
      ],
    );
  }, [deleteTransaction, onClose, transaction.id]);

  const handleSubmit = useCallback(
    (input: Parameters<typeof updateTransaction>[1]) => {
      if (isLegacyBalanceAdjustmentTransfer) {
        updateTransaction(transaction.id, {
          ...input,
          type: 'transfer',
          categoryId: null,
          fromAccountId: null,
          toAccountId: null,
        });
        return;
      }
      updateTransaction(transaction.id, input);
    },
    [isLegacyBalanceAdjustmentTransfer, transaction.id, updateTransaction],
  );

  const handleSubmitWithSplits = useCallback(
    (input: CreateTransactionInput, splits: SplitDraft[]) => {
      // Diff editor splits against the persisted state to find newly paid /
      // newly unpaid rows. These were staged locally — flush them to the DB now.
      // NOTE: a brand-new split (no prior in DB) with `s.paid` set is also
      // routed through markSplitPaid below; updateTransactionSplits runs first
      // so the row exists in state by the time markSplitPaid looks it up.
      const persistedSplits = transaction.splits ?? [];
      const persistedById = new Map(persistedSplits.map((s) => [s.id, s]));
      const pendingMarkPaid: { id: string; paybackAccountId: string | null }[] = [];
      const pendingMarkUnpaid: string[] = [];
      splits.forEach((s) => {
        if (!s.id) return;
        const prior = persistedById.get(s.id);
        const wasPaid = prior ? !!prior.paidAt : false;
        const isPaid = !!s.paid;
        if (isPaid && !wasPaid) {
          pendingMarkPaid.push({
            id: s.id,
            paybackAccountId: s.paybackAccountId ?? input.accountId ?? null,
          });
        } else if (!isPaid && wasPaid) {
          pendingMarkUnpaid.push(s.id);
        }
      });

      // Persist split structure FIRST so any brand-new rows exist (in
      // optimistic state and queued for DB) before we ask markSplitPaid to
      // find them. updateTransactionSplits preserves the prior paid state on
      // existing rows; new rows are inserted unpaid (paidAt=null).
      updateTransactionSplits(
        transaction.id,
        splitsHelpers.toSplitDraftInputs(splits, input.accountId),
      );

      // Then flip paid/unpaid — these adjust parent amount and create or
      // delete linked transfer transactions. Because they read parent from
      // setTransactions(prev=>...), they see the freshly-inserted splits
      // from the previous setter in the same React batch.
      pendingMarkPaid.forEach(({ id, paybackAccountId }) => {
        markSplitPaid(id, { paybackAccountId });
      });
      pendingMarkUnpaid.forEach((id) => {
        markSplitUnpaid(id);
      });

      // Finally write parent fields. The editor's amount already accounts for
      // all the user's paid/unpaid toggles (handleSplitMarkPaidLocal mutates
      // it in lockstep), so input.amount is the intended final value — this
      // overwrites the cumulative reductions from markSplitPaid above.
      updateTransaction(transaction.id, input);
    },
    [
      markSplitPaid,
      markSplitUnpaid,
      transaction.id,
      transaction.splits,
      updateTransaction,
      updateTransactionSplits,
    ],
  );

  const initialSplits = useMemo<SplitDraft[] | undefined>(() => {
    const persisted = transaction.splits;
    if (!persisted || persisted.length === 0) return undefined;
    return persisted.map((s) => ({
      id: s.id,
      personName: s.personName ?? '',
      amount: s.amount.toFixed(2),
      isSelf: s.isSelf,
      paybackAccountId: s.paybackAccountId,
      paid: s.paidAt ? { paidAt: s.paidAt, paidTransactionId: s.paidTransactionId } : undefined,
    }));
  }, [transaction.splits]);

  return (
    <TransactionEditorScreen
      mode="edit"
      onClose={onClose}
      onDelete={handleDelete}
      hideAccountSelector={isSimpleMode && !isBalanceAdjustment}
      initialAccountId={initialAccountId}
      onSubmit={handleSubmit}
      onSubmitWithSplits={handleSubmitWithSplits}
      restrictTypeOptions={restrictedTypes}
      initialSplits={initialSplits}
      openSplitBillOnMount={openSplitBillOnMount}
      subtitleOverride={
        isBalanceAdjustment
          ? I18n.t('transactions.editor.subtitle_edit_balance_adjustment')
          : undefined
      }
      initialValues={{
        type: isBalanceAdjustment ? 'balance_adjustment' : transaction.type,
        amount: String(transaction.amount),
        date: dayKeyFromIsoLocal(transaction.date),
        accountId: transaction.accountId,
        fromAccountId: transaction.fromAccountId,
        toAccountId: transaction.toAccountId,
        toAmount: transaction.toAmount,
        currency: transaction.currency,
        categoryId: transaction.categoryId,
        note: transaction.note ?? '',
        receiptUri: transaction.receiptUri ?? null,
        sentiment: transaction.sentiment ?? 'neutral',
        claimStatus: transaction.claimStatus,
        claimAmount: transaction.claimAmount,
        claimReimbursedAmount: transaction.reimbursedAmount,
      }}
      onMarkReimbursed={() => {
        markReimbursed(transaction.id);
        onClose();
      }}
    />
  );
}
