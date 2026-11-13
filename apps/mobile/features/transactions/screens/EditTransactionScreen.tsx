import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import {
  useApp,
  usePaybackIndex,
  useTransactions,
  useTransferFeeIndex,
} from '~/context/AppContext';
import { albumBillRows, useAlbumBillTarget } from '~/features/albums/hooks/useAlbumBillTarget';
import { useGroupBillOrigin } from '~/features/albums/hooks/useGroupBillOrigin';
import { needsAccountConfirm } from '~/features/albums/lib/albumGroup';
import type { InstalmentChoice } from '~/features/instalments/components/InstalmentSheet';
import { useCanStartInstalmentPlan } from '~/features/instalments/hooks/useCanStartInstalmentPlan';
import {
  canConvertToInstalmentPlan,
  scheduleOfFrequency,
} from '~/features/instalments/lib/instalmentPlan';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { type SplitDraft, splitsHelpers } from '~/features/transactions/components/editor';
import type { TransactionEditorSubmitExtras } from '~/features/transactions/components/TransactionEditorScreen';
import {
  billPayer,
  draftPayer,
  friendPaidBillTotal,
  friendPaidExpense,
  friendShare,
  isPayBackPart,
  paidBackInParts,
} from '~/features/transactions/lib/splitPayer';
import { splitShareKey } from '~/features/transactions/lib/splitPayments';
import {
  transferFeeAccountAmount,
  type TransferFeeDraft,
  transferFeeDraftOf,
} from '~/features/transactions/lib/transferFee';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { RootStackParamList } from '~/navigation/rootStack';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import type { TransactionType, TransactionWithRelations } from '~/types';
import { getErrorMessage } from '~/utils/errorHandling';
import { dateKeepingTimeOfDay, dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';

interface EditTransactionScreenProps {
  transaction: TransactionWithRelations;
  onClose: () => void;
  /** Open the Split Bill modal automatically when the editor mounts. Set by
   *  callers (e.g. activity list) when the tapped row has unpaid splits. */
  openSplitBillOnMount?: boolean;
}

/**
 * A transfer's fee is edited with its transfer, so opening the fee's own row
 * (from a category's list, say) opens the transfer it was charged on.
 */
export function EditTransactionScreen(props: EditTransactionScreenProps) {
  const transferId = useTransferFeeIndex().byFeeId.get(props.transaction.id)?.transferId;
  const { transactions } = useTransactions();
  const transfer = useMemo(
    () => (transferId ? (transactions.find((tx) => tx.id === transferId) ?? null) : null),
    [transactions, transferId],
  );
  return (
    <TransactionEditor
      key={transfer?.id ?? props.transaction.id}
      {...props}
      transaction={transfer ?? props.transaction}
    />
  );
}

function TransactionEditor({
  transaction,
  onClose,
  openSplitBillOnMount,
}: EditTransactionScreenProps) {
  // Opened from the calendar's route or inside Accounts: either way the plan
  // page is a root route, which navigate() reaches from a nested stack too.
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    updateTransaction,
    updateTransactionSplits,
    deleteTransaction,
    markSplitPaid,
    markSplitUnpaid,
    instalmentPlans,
    convertTransactionToInstalmentPlan,
    saveTransferFee,
    settings,
    getAccountById,
    saveAlbumBill,
    detachAlbumBill,
    getReceiptSplitForTransaction,
  } = useApp();
  const { transactions } = useTransactions();
  // A shared album's bill is saved through its group (README: Album members
  // and shared albums): the entry here follows from what the group holds.
  // A bill split by item stays the user's own: the group does not hold its items.
  const albumTarget = useAlbumBillTarget(transaction.id);
  const albumGroupId = getReceiptSplitForTransaction(transaction.id) ? null : albumTarget;
  // The expense a part payment on a group's bill made follows that payment:
  // split, it would become a bill of its own under the payment's id.
  const isGroupPayment = useMemo(
    () =>
      transactions.some(
        (tx) =>
          !!tx.albumGroupId &&
          !!tx.splits?.some((split) => split.paidTransactionId === transaction.id),
      ),
    [transaction.id, transactions],
  );
  const canStartPlan = useCanStartInstalmentPlan();
  // The fee this transfer was charged, edited with it.
  const feeLink = useTransferFeeIndex().byTransferId.get(transaction.id) ?? null;
  const initialTransferFee = useMemo<TransferFeeDraft | null>(
    () =>
      transaction.type === 'transfer' && feeLink ? transferFeeDraftOf(transaction, feeLink) : null,
    // Read once: the editor keeps its own draft after it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Saves the transfer's fee as the editor left it. A transfer re-typed as
  // something else keeps its fee as a plain expense (`updateTransactionsBulk`
  // drops the link), so only a transfer saves one here.
  const saveFeeFor = useCallback(
    (input: Partial<CreateTransactionInput>, fee: TransferFeeDraft | null) => {
      if ((input.type ?? transaction.type) !== 'transfer') return;
      saveTransferFee(
        {
          id: transaction.id,
          date:
            typeof input.date === 'string'
              ? dateKeepingTimeOfDay(input.date, transaction.date)
              : transaction.date,
          fromAccountId:
            input.fromAccountId !== undefined ? input.fromAccountId : transaction.fromAccountId,
          toAccountId:
            input.toAccountId !== undefined ? input.toAccountId : transaction.toAccountId,
          memberId: input.memberId !== undefined ? input.memberId : transaction.memberId,
          createdAt: transaction.createdAt,
          dayOrder: transaction.dayOrder,
        },
        fee,
      );
    },
    [saveTransferFee, transaction],
  );
  // A payment of an instalment plan links back to it.
  const instalmentPlan = transaction.instalmentRuleId
    ? (instalmentPlans.find((plan) => plan.rule.id === transaction.instalmentRuleId) ?? null)
    : null;
  // A shared album's bill says where it is from and who last changed it, so a
  // figure that moved has a reason; one someone else said the user paid asks
  // which account it left (README: Album members and shared albums).
  const groupOrigin = useGroupBillOrigin(transaction);
  const confirmAccount = needsAccountConfirm(transaction);
  const groupNotice = groupOrigin
    ? {
        label: confirmAccount
          ? groupOrigin.changedBy
            ? I18n.t('albums.bill.confirm_paid_by', { name: groupOrigin.changedBy })
            : I18n.t('albums.bill.confirm_paid')
          : groupOrigin.changedBy
            ? I18n.t('albums.bill.changed_by', {
                name: groupOrigin.changedBy,
                album: groupOrigin.albumName ?? I18n.t('albums.bill.shared_album'),
              })
            : I18n.t('albums.bill.from_album', {
                album: groupOrigin.albumName ?? I18n.t('albums.bill.shared_album'),
              }),
        actionLabel: I18n.t('albums.bill.view_album'),
        icon: 'settings/albums' as const,
        onPress: () =>
          navigation.navigate('AlbumDetail', { albumId: groupOrigin.albumId }, { pop: true }),
      }
    : undefined;
  const headerNotice = instalmentPlan
    ? {
        label:
          transaction.instalmentNumber === 0
            ? I18n.t('instalments.edit_notice_payoff', { name: instalmentPlan.rule.name })
            : I18n.t('instalments.edit_notice', {
                number: transaction.instalmentNumber ?? 0,
                count: instalmentPlan.entries.length,
                name: instalmentPlan.rule.name,
              }),
        actionLabel: I18n.t('instalments.view_plan'),
        // Back to the plan page when it opened this payment, rather than a
        // second copy of it on top.
        onPress: () =>
          navigation.navigate('InstalmentPlan', { planId: instalmentPlan.rule.id }, { pop: true }),
      }
    : groupNotice;
  const isLegacyBalanceAdjustmentTransfer =
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId;
  const isBalanceAdjustment =
    transaction.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer;
  // A plan's payment stays an expense of its own: as income, a transfer or a
  // split bill it would still count towards the plan.
  const isInstalmentPayment = !!transaction.instalmentRuleId;
  const restrictedTypes = useMemo<TransactionType[] | undefined>(
    () =>
      isBalanceAdjustment ? ['balance_adjustment'] : isInstalmentPayment ? ['expense'] : undefined,
    [isBalanceAdjustment, isInstalmentPayment],
  );

  // An expense saved already (often by a receipt scan or a notification) can
  // still be paid in instalments: the editor offers the same Instalments chip
  // as the add form, and saving turns the expense into the plan's payment 1.
  const canConvertToPlan = canConvertToInstalmentPlan(transaction);
  const instalmentOptions = useMemo(
    () =>
      canConvertToPlan
        ? {
            initialChoice: null,
            canStart: canStartPlan,
            onSubmitPlan: ({
              transaction: input,
              choice,
            }: {
              transaction: CreateTransactionInput;
              choice: InstalmentChoice;
            }) => {
              const { pattern, interval } = scheduleOfFrequency(choice.frequency);
              convertTransactionToInstalmentPlan(
                transaction.id,
                input,
                {
                  count: choice.count,
                  recurrencePattern: pattern,
                  recurrenceInterval: interval,
                  regularAmount: choice.amount ?? null,
                },
                // Flash the row once it is payment 1, with its "1/12" pill.
                () => requestHighlightTransaction(transaction.id),
              );
            },
          }
        : undefined,
    [canConvertToPlan, canStartPlan, convertTransactionToInstalmentPlan, transaction.id],
  );

  // A friend's payback transfer: deleting it undoes the payment, which goes
  // back on what they owe for the bill, so the confirmation says so.
  const paybackLink = usePaybackIndex().get(transaction.id) ?? null;

  const handleDelete = useCallback(() => {
    Alert.alert(
      I18n.t('transactions.editor.delete_transaction'),
      transaction.albumGroupId && albumGroupId
        ? // A shared album's bill is everyone's: deleting it deletes it for them too.
          I18n.t('albums.bill.delete_shared')
        : paybackLink
          ? paybackLink.personName
            ? I18n.t('transactions.editor.delete_payback_confirm', { name: paybackLink.personName })
            : I18n.t('transactions.editor.delete_payback_confirm_unnamed')
          : feeLink
            ? I18n.t('transactions.editor.transfer_fee.delete_confirm', {
                fee: formatAmount(transferFeeAccountAmount(feeLink), settings, {
                  currencyCode:
                    (feeLink.accountId ? getAccountById(feeLink.accountId)?.currency : null) ??
                    feeLink.currency,
                }),
              })
            : I18n.t('transactions.editor.delete_confirm'),
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
  }, [
    albumGroupId,
    deleteTransaction,
    feeLink,
    getAccountById,
    onClose,
    paybackLink,
    settings,
    transaction.albumGroupId,
    transaction.id,
  ]);

  const handleSubmit = useCallback(
    (input: Parameters<typeof updateTransaction>[1], extras?: TransactionEditorSubmitExtras) => {
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
      saveFeeFor(input, extras?.transferFee ?? null);
    },
    [isLegacyBalanceAdjustmentTransfer, saveFeeFor, transaction.id, updateTransaction],
  );

  /** Saves a split bill that is the user's own (not a shared album's). */
  const saveOwnSplits = useCallback(
    (
      input: CreateTransactionInput,
      splits: SplitDraft[],
      extras?: TransactionEditorSubmitExtras,
    ) => {
      // A friend paid: the expense is the user's own share and nobody owes the
      // user, so there are no paybacks to flush. It stays on no account until
      // the user has paid that friend back, then keeps the one it was paid from.
      const payer = draftPayer(splits);
      if (payer) {
        // The Me row is the user's whole share; the bill itself is what is
        // left of it after the parts already paid back, which stay as they are.
        const share = Number(splits.find((s) => s.isSelf)?.amount) || 0;
        const paidBack = payer.paidBack ?? 0;
        const expense = friendPaidExpense(input, share - paidBack, !!payer.settled);
        const parts = (transaction.splits ?? []).filter(
          (s) => isPayBackPart(s) && s.partOfSplitId === payer.id,
        );
        updateTransactionSplits(transaction.id, [
          ...splitsHelpers
            .toSplitDraftInputs(splits, expense.accountId ?? null)
            .map((row) => (row.isSelf ? { ...row, amount: expense.amount } : row)),
          ...parts.map((part) => ({
            id: part.id,
            personName: payer.personName.trim() || null,
            amount: 0,
            isSelf: false,
            paybackAccountId: part.paybackAccountId,
            sortOrder: part.sortOrder,
            partOfSplitId: part.partOfSplitId,
            isPayer: false,
            shareAmount: part.shareAmount,
            memberId: part.memberId,
          })),
        ]);
        updateTransaction(transaction.id, expense);
        return;
      }

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
        { markingPaidIds: pendingMarkPaid.map((paid) => paid.id) },
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
      saveFeeFor(input, extras?.transferFee ?? null);
    },
    [
      markSplitPaid,
      markSplitUnpaid,
      saveFeeFor,
      transaction.id,
      transaction.splits,
      updateTransaction,
      updateTransactionSplits,
    ],
  );

  const handleSubmitWithSplits = useCallback(
    (
      input: CreateTransactionInput,
      splits: SplitDraft[],
      extras?: TransactionEditorSubmitExtras,
    ) => {
      const isGroupBill = !!albumGroupId && !!transaction.albumGroupId;
      if (albumGroupId && splits.some((row) => !row.isSelf)) {
        const saved = saveAlbumBill(
          albumGroupId,
          { ...input, date: dateKeepingTimeOfDay(input.date, transaction.date) },
          albumBillRows(splits),
          transaction.id,
        );
        if (saved) return;
        // A group's bill is only ever saved through its group: when that
        // failed (signed out, the share gone), say so rather than drop it.
        if (isGroupBill) {
          Alert.alert(I18n.t('errors.generic_operation_failed'));
          return;
        }
      } else if (isGroupBill) {
        // No longer split: the bill leaves the group, for everyone, and stays
        // the user's own entry (asked in `confirmSplitSubmit`, before closing).
        detachAlbumBill(transaction.id);
      }
      saveOwnSplits(input, splits, extras);
    },
    [
      albumGroupId,
      detachAlbumBill,
      saveAlbumBill,
      saveOwnSplits,
      transaction.albumGroupId,
      transaction.date,
      transaction.id,
    ],
  );

  // Taking everyone off a shared album's bill takes it from everyone else, so
  // that is asked while the editor is still open: Cancel keeps every edit.
  const confirmSplitSubmit = useCallback(
    (splits: SplitDraft[]) =>
      new Promise<boolean>((resolve) => {
        const leavesGroup =
          !!albumGroupId && !!transaction.albumGroupId && !splits.some((row) => !row.isSelf);
        if (!leavesGroup) {
          resolve(true);
          return;
        }
        // The bill stays in this album as the user's own, so the alert is the
        // sentence alone, not "Remove from album".
        Alert.alert(
          I18n.t('albums.bill.remove_shared'),
          undefined,
          [
            { text: I18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: I18n.t('common.remove'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [albumGroupId, transaction.albumGroupId],
  );

  const initialSplits = useMemo<SplitDraft[] | undefined>(() => {
    const persisted = transaction.splits;
    if (!persisted || persisted.length === 0) return undefined;
    // A bill a friend paid is edited whole: each friend's row shows its share
    // of the bill (stored beside a zero `amount`), and the payer's `paidAt`,
    // which is the user paying them back, is not a payback to the user.
    const payer = billPayer(persisted);
    if (payer) {
      // What the user already paid back in parts was cut out of the bill, so
      // their whole share is what is left plus those parts.
      const paidBack = paidBackInParts(persisted);
      return persisted
        .filter((s) => !s.partOfSplitId)
        .map((s) => ({
          id: s.id,
          personName: s.personName ?? '',
          amount: (s.isSelf ? s.amount + paidBack : friendShare(s)).toFixed(2),
          isSelf: s.isSelf,
          paybackAccountId: null,
          isPayer: s.id === payer.id,
          settled: s.id === payer.id && s.paidAt ? { paidAt: s.paidAt } : undefined,
          paidBack: s.id === payer.id && paidBack > 0 ? paidBack : undefined,
          memberId: s.memberId,
          albumMemberId: s.albumMemberId,
        }));
    }
    return persisted.map((s) => ({
      id: s.id,
      personName: s.personName ?? '',
      amount: s.amount.toFixed(2),
      isSelf: s.isSelf,
      paybackAccountId: s.paybackAccountId,
      paid: s.paidAt ? { paidAt: s.paidAt, paidTransactionId: s.paidTransactionId } : undefined,
      shareKey: s.isSelf ? undefined : splitShareKey(s),
      memberId: s.memberId,
      albumMemberId: s.albumMemberId,
    }));
  }, [transaction.splits]);

  return (
    <TransactionEditorScreen
      mode="edit"
      onClose={onClose}
      onDelete={handleDelete}
      onSubmit={handleSubmit}
      onSubmitWithSplits={handleSubmitWithSplits}
      confirmSplitSubmit={confirmSplitSubmit}
      restrictTypeOptions={restrictedTypes}
      hideSplitMode={isInstalmentPayment || isGroupPayment}
      initialSplits={initialSplits}
      groupBill={albumGroupId !== null}
      initialTransferFee={initialTransferFee}
      openSplitBillOnMount={openSplitBillOnMount}
      headerNotice={headerNotice}
      startWithoutAccount={confirmAccount}
      instalmentOptions={instalmentOptions}
      subtitleOverride={
        isBalanceAdjustment
          ? I18n.t('transactions.editor.subtitle_edit_balance_adjustment')
          : undefined
      }
      initialValues={{
        type: isBalanceAdjustment ? 'balance_adjustment' : transaction.type,
        // A bill a friend paid is edited whole; the expense is the user's share.
        amount: String(
          billPayer(transaction.splits)
            ? friendPaidBillTotal(transaction.splits ?? [], transaction.amount)
            : transaction.amount,
        ),
        date: dayKeyFromIsoLocal(transaction.date),
        accountId: transaction.accountId,
        fromAccountId: transaction.fromAccountId,
        toAccountId: transaction.toAccountId,
        toAmount: transaction.toAmount,
        currency: transaction.currency,
        reportingCurrency: transaction.reportingCurrency,
        reportingAmount: transaction.reportingAmount,
        fxRate: transaction.fxRate,
        categoryId: transaction.categoryId,
        note: transaction.note ?? '',
        details: transaction.details ?? '',
        receiptUri: transaction.receiptUri ?? null,
        sentiment: transaction.sentiment ?? 'neutral',
        reimbursable: transaction.reimbursable,
        reimbursedAt: transaction.reimbursedAt,
        countsAsExpense: transaction.countsAsExpense,
        createdBy: transaction.createdBy,
        memberId: transaction.memberId,
      }}
    />
  );
}
