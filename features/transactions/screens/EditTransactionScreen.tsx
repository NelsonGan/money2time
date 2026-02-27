import React from 'react';
import { Alert } from 'react-native';

import { TransactionEditorScreen } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';
import { getErrorMessage } from '~/utils/errorHandling';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import type { TransactionWithRelations } from '~/types';
import { I18n } from '~/lib/i18n';

interface EditTransactionScreenProps {
  transaction: TransactionWithRelations;
  onClose: () => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
}

export function EditTransactionScreen({
  transaction,
  onClose,
  isSimpleMode,
  simpleWalletId,
}: EditTransactionScreenProps) {
  const { updateTransaction, deleteTransaction } = useApp();
  const isLegacyBalanceAdjustmentTransfer =
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId;
  const isBalanceAdjustment =
    transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer;

  const handleDelete = () => {
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
  };

  return (
    <TransactionEditorScreen
      mode="edit"
      onClose={onClose}
      onDelete={handleDelete}
      hideAccountSelector={isSimpleMode && !isBalanceAdjustment}
      initialAccountId={isSimpleMode && simpleWalletId ? simpleWalletId : undefined}
      onSubmit={(input) => {
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
      }}
      restrictTypeOptions={
        isBalanceAdjustment
          ? ['balance_adjustment']
          : isSimpleMode
            ? ['expense', 'income']
            : undefined
      }
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
      }}
    />
  );
}
