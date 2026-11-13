import React, { useCallback, useMemo } from 'react';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { albumBillRows, useAlbumBillTarget } from '~/features/albums/hooks/useAlbumBillTarget';
import { useAlbumGroup } from '~/features/albums/hooks/useAlbumGroup';
import { useJoinedOthers } from '~/features/albums/hooks/useGroupBillOrigin';
import { splitWithPeople } from '~/features/albums/lib/albumPeople';
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
import { draftPayer, friendPaidExpense } from '~/features/transactions/lib/splitPayer';
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
  /** The album the entry goes into and starts split with; the active album when not given. */
  albumId?: string;
}

export function AddTransactionScreen({
  onClose,
  onSubmitReady,
  initialAccountId,
  initialValues,
  openSplitBillOnMount,
  startInstalmentPlan = false,
  albumId,
}: AddTransactionScreenProps) {
  const {
    createTransaction,
    createTransactionWithSplits,
    markSplitPaid,
    createInstalmentPlan,
    albums,
    activeAlbumId,
    addTransactionsToAlbum,
    saveAlbumBill,
    getUnpaidSplitBillCount,
  } = useApp();
  // The people of the album the entry goes into (the one it was opened from,
  // else the active one): a new expense starts split with them. In a shared
  // album that is everyone in its group, once this phone has said who it is;
  // there the bill is saved through the group, and counts toward no free
  // limit (a shared album has none).
  const targetAlbumId = albumId ?? activeAlbumId;
  const targetAlbum = albums.find((album) => album.id === targetAlbumId) ?? null;
  const albumGroup = useAlbumGroup(targetAlbum);
  const albumGroupId = useAlbumBillTarget(undefined, albumId);
  // An entry of the user's own goes into the active album by itself; one
  // opened from another album is put there.
  const addToAlbum = useCallback(
    (id: string) => {
      if (albumId && albumId !== activeAlbumId) addTransactionsToAlbum(albumId, [id]);
    },
    [activeAlbumId, addTransactionsToAlbum, albumId],
  );
  const groupBill = albumGroupId !== null && albumGroup.self !== null;
  // Only you can say you paid: Paid by leaves out everyone else who joined.
  const payerExcludedMemberIds = useJoinedOthers(albumGroupId);
  const isPro = useIsPro();
  const withinSplitLimit =
    isPro || groupBill || getUnpaidSplitBillCount() < PRO_LIMITS.FREE_MAX_UNSETTLED_SPLIT_BILLS;
  const splitWith = useMemo(
    () =>
      albumGroup.available && withinSplitLimit && (!albumGroup.share || albumGroup.self)
        ? splitWithPeople(albumGroup.people)
        : [],
    [albumGroup, withinSplitLimit],
  );
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
      addToAlbum(id);
      requestHighlightTransaction(id);
    },
    [addToAlbum, createTransaction],
  );

  const handleSubmitWithSplits = useCallback(
    (input: CreateTransactionInput, splits: SplitDraft[]) => {
      // A shared album's bill is the group's: this phone's entry follows from it.
      if (albumGroupId) {
        const saved = saveAlbumBill(albumGroupId, input, albumBillRows(splits));
        if (saved) {
          if (saved.mine) requestHighlightTransaction(saved.id);
          return;
        }
      }
      // A friend paid: the expense is the user's own share, on no account
      // until they pay that friend back, and nobody owes the user anything.
      if (draftPayer(splits)) {
        const share = Number(splits.find((s) => s.isSelf)?.amount) || 0;
        addToAlbum(
          createTransactionWithSplits(
            friendPaidExpense(input, share, false),
            splitsHelpers.toSplitDraftInputs(splits, null),
          ),
        );
        return;
      }

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

      addToAlbum(
        createTransactionWithSplits(
          { ...input, amount: originalTotal },
          splitsHelpers.toSplitDraftInputs(unpaidDrafts, input.accountId),
        ),
      );

      pendingMarkPaid.forEach(({ id, paybackAccountId }) => {
        markSplitPaid(id, { paybackAccountId });
      });
    },
    [addToAlbum, albumGroupId, createTransactionWithSplits, markSplitPaid, saveAlbumBill],
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
      defaultSplitWith={splitWith}
      // Split with the album's people: Add shows the split before it saves.
      confirmSplitBeforeAdd={splitWith.length > 0}
      groupBill={groupBill}
      payerExcludedMemberIds={payerExcludedMemberIds}
    />
  );
}
