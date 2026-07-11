import { Image } from 'expo-image';
import { ChevronRight, Trash2 } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  AccountLogo,
  AccountPickerSheet,
  Button,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { type ScanJobDraft, useReceiptScans } from '~/context/ReceiptScanContext';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { setScanEditSession } from '~/features/transactions/lib/scanEditBridge';
import { consumePendingScanReview } from '~/features/transactions/lib/scanReviewBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { getReceiptUri } from '~/services/userAssets';
import type { Account, Category, TransactionWithRelations } from '~/types';

interface ScanReviewScreenProps {
  onClose: () => void;
  /** Push the full transaction editor (ScanDraftEdit route). */
  openEditor: () => void;
}

function draftToInitialValues(draft: ScanJobDraft): AddTransactionInitialValues {
  return {
    type: draft.type,
    amount: String(draft.amount),
    date: draft.date,
    accountId: draft.accountId,
    fromAccountId: null,
    toAccountId: null,
    categoryId: draft.categoryId,
    note: draft.note ?? '',
    sentiment: draft.sentiment,
    currency: draft.currency,
    // Omit receiptUri: the shared receipt is attached once at Approve.
  };
}

/** Builds a display-only transaction from a draft so we can reuse TransactionItem. */
function draftToTransaction(
  draft: ScanJobDraft,
  receiptUri: string | null,
  category: Category | null,
  account: Account | null,
): TransactionWithRelations {
  return {
    id: draft.id,
    // TransactionItem memoizes on id + updatedAt, so encode the mutable fields
    // here to force a re-render after an edit or account change.
    updatedAt: `${draft.amount}|${draft.categoryId}|${draft.accountId}|${draft.date}|${draft.note ?? ''}|${draft.type}`,
    createdAt: '',
    deletedAt: null,
    type: draft.type,
    amount: draft.amount,
    currency: draft.currency,
    reportingCurrency: draft.currency,
    reportingAmount: draft.amount,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    date: draft.date,
    accountId: draft.accountId,
    fromAccountId: null,
    toAccountId: null,
    categoryId: draft.categoryId,
    note: draft.note,
    receiptUri,
    recurrencePattern: 'none',
    recurrenceInterval: 0,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: draft.sentiment,
    accountName: account?.name ?? null,
    fromAccountName: null,
    toAccountName: null,
    categoryName: category?.name ?? null,
    categoryParentId: category?.parentId ?? null,
    categoryParentName: null,
    categoryIcon: category?.icon ?? null,
    splits: [],
  };
}

export function ScanReviewScreen({ onClose, openEditor }: ScanReviewScreenProps) {
  const { jobs, patchJobDraft, removeJobDraft, setAllJobDraftsAccount, completeJob, dismissJob } =
    useReceiptScans();
  const {
    createTransaction,
    categories,
    accounts,
    accountGroups,
    settings,
    quickEntryPrefs,
    getTrueHourlyRateForDate,
    isSimpleMode,
  } = useApp();
  const themeColors = useThemeColors();

  const [jobId] = useState(() => consumePendingScanReview());
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [bulkAccountId, setBulkAccountId] = useState<string | null>(() => {
    if (quickEntryPrefs.defaultAccountId) return quickEntryPrefs.defaultAccountId;
    const sorted = [...accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return sorted[0]?.id ?? null;
  });

  const job = jobId ? (jobs.find((j) => j.id === jobId) ?? null) : null;

  // The action handlers only mutate context; when that removes the job
  // (approve / dismiss / last row deleted) — or on a cold restore — this closes
  // the screen exactly once. Keeps close logic in one place so no handler
  // double-pops the stack.
  const didCloseRef = useRef(false);
  useEffect(() => {
    if (!job && !didCloseRef.current) {
      didCloseRef.current = true;
      onClose();
    }
  }, [job, onClose]);

  if (!job) return null;

  const drafts = job.drafts;
  const receiptUri = job.receiptUri;
  const resolvedReceiptUri = getReceiptUri(receiptUri);
  const displaySettings = {
    currencySymbol: settings.currencySymbol,
    displayMode: settings.displayMode,
  };
  const selectedAccount = accounts.find((a) => a.id === bulkAccountId) ?? null;
  const canApprove = drafts.length > 0 && drafts.every((d) => d.amount > 0);

  const handleSelectAccount = (id: string) => {
    setBulkAccountId(id);
    setAllJobDraftsAccount(job.id, id);
    setAccountPickerVisible(false);
  };

  const handleDelete = (draftId: string) => {
    void triggerHaptic('selection');
    // Removing the last row leaves nothing to review, so discard the whole scan
    // (the effect closes the screen once the job is gone).
    if (drafts.length <= 1) {
      dismissJob(job.id);
      return;
    }
    removeJobDraft(job.id, draftId);
  };

  const handleEdit = (draft: ScanJobDraft) => {
    setScanEditSession({
      initialValues: draftToInitialValues(draft),
      onDone: (input: CreateTransactionInput) =>
        patchJobDraft(job.id, draft.id, {
          type: input.type === 'income' ? 'income' : 'expense',
          amount: input.amount,
          currency: input.currency,
          date: input.date,
          accountId: input.accountId ?? null,
          categoryId: input.categoryId ?? null,
          note: input.note ?? null,
          sentiment: input.sentiment ?? 'neutral',
        }),
    });
    openEditor();
  };

  const handleApprove = () => {
    const toSave = drafts.filter((d) => d.amount > 0);
    if (toSave.length === 0) return;
    void triggerHaptic('success');
    let firstId: string | null = null;
    toSave.forEach((draft) => {
      const id = createTransaction(
        {
          type: draft.type,
          amount: draft.amount,
          currency: draft.currency,
          date: draft.date,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          note: draft.note,
          sentiment: draft.sentiment,
          receiptUri: receiptUri ?? null,
        },
        { source: 'receipt' },
      );
      if (!firstId) firstId = id;
    });
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_SAVED, { count: toSave.length });
    if (firstId) requestHighlightTransaction(firstId);
    completeJob(job.id); // removes the job → the effect closes the screen
  };

  const handleDismiss = () => {
    void triggerHaptic('selection');
    dismissJob(job.id); // removes the job → the effect closes the screen
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onClose}
        title={I18n.t('receiptScan.review_title', { count: drafts.length })}
        rightAccessory={
          <Pressable
            onPress={handleDismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('receiptScan.dismiss')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="body" tone="muted">
              {I18n.t('receiptScan.dismiss')}
            </Text>
          </Pressable>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {resolvedReceiptUri ? (
          <View className="mb-4 items-center">
            <Image
              source={{ uri: resolvedReceiptUri }}
              style={{ width: 120, height: 160, borderRadius: 14 }}
              contentFit="cover"
            />
          </View>
        ) : null}

        {!isSimpleMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('transactions.editor.account')}
            onPress={() => {
              void triggerHaptic('selection');
              setAccountPickerVisible(true);
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="mb-3 flex-row items-center justify-between rounded-[18px] border border-border/30 bg-card px-4 py-3.5"
          >
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.account')}
            </Text>
            <View className="flex-row items-center gap-2">
              {selectedAccount ? (
                <>
                  <AccountLogo
                    logoId={selectedAccount.logoId}
                    type={selectedAccount.type}
                    size={20}
                  />
                  <Text variant="body">{selectedAccount.name}</Text>
                </>
              ) : (
                <Text variant="body" tone="muted">
                  {I18n.t('transactions.editor.choose_account')}
                </Text>
              )}
              <ChevronRight size={16} color={themeColors.textMuted} />
            </View>
          </Pressable>
        ) : null}

        <Text variant="caption" tone="muted" className="mb-3">
          {I18n.t('receiptScan.review_hint')}
        </Text>

        {drafts.map((draft) => {
          const category = categories.find((c) => c.id === draft.categoryId) ?? null;
          const account = accounts.find((a) => a.id === draft.accountId) ?? null;
          const transaction = draftToTransaction(draft, receiptUri, category, account);
          return (
            <View key={draft.id} className="flex-row items-center gap-1">
              <View className="flex-1">
                <TransactionItem
                  transaction={transaction}
                  settings={displaySettings}
                  getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                  onPressTransaction={() => handleEdit(draft)}
                  showDateInSubtitle
                  disableAnimations
                />
              </View>
              <Pressable
                onPress={() => handleDelete(draft.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                className="h-9 w-9 items-center justify-center"
              >
                <Trash2 size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <View className="px-5 pb-8 pt-2">
        <Button onPress={handleApprove} disabled={!canApprove} className="w-full">
          <Text>{I18n.t('receiptScan.approve', { count: drafts.length })}</Text>
        </Button>
      </View>

      <AccountPickerSheet
        visible={accountPickerVisible}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={bulkAccountId}
        onSelect={handleSelectAccount}
        onClose={() => setAccountPickerVisible(false)}
      />
    </SettingsPageLayout>
  );
}
