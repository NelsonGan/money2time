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
      const persistedSplits = transaction.splits ?? [];
      const persistedById = new Map(persistedSplits.map((s) => [s.id, s]));
      const pendingMarkPaid: { id: string; paybackAccountId: string | null }[] = [];
      const pendingMarkUnpaid: string[] = [];
      splits.forEach((s) => {
        if (!s.id) return;
        const prior = persistedById.get(s.id);
        if (!prior) return;
        const wasPaid = !!prior.paidAt;
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

      // Apply paid/unpaid first — these adjust the parent amount and create or
      // delete linked transfer transactions.
      pendingMarkPaid.forEach(({ id, paybackAccountId }) => {
        markSplitPaid(id, { paybackAccountId });
      });
      pendingMarkUnpaid.forEach((id) => {
        markSplitUnpaid(id);
      });

      // Then update parent fields (amount will already be in sync since the
      // editor's amount mirrors the staged paid actions; updating it again
      // here is a no-op).
      updateTransaction(transaction.id, input);

      // Then update split structure (names, amounts, accounts of unpaid rows).
      // updateTransactionSplits preserves the paid state set above.
      updateTransactionSplits(
        transaction.id,
        splitsHelpers.toSplitDraftInputs(splits, input.accountId),
      );
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
        categoryId: transaction.categoryId,
        note: transaction.note ?? '',
        sentiment: transaction.sentiment ?? 'neutral',
      }}
    />
  );
}
