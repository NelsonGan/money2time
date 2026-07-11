import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
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
import { useReceiptScans } from '~/context/ReceiptScanContext';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { consumePendingScanReview } from '~/features/transactions/lib/scanReviewBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { ScanDraft } from '~/services/receiptScan';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { getReceiptUri } from '~/services/userAssets';
import type { Account, Category, TransactionWithRelations } from '~/types';

interface ScanReviewScreenProps {
  onClose: () => void;
}

interface RowState extends ScanDraft {
  key: string;
  /** Whether this row is approved (saved on Approve). */
  selected: boolean;
}

/** Builds a display-only transaction from a draft so we can reuse TransactionItem. */
function draftToTransaction(
  row: RowState,
  receiptUri: string | null,
  category: Category | null,
  account: Account | null,
): TransactionWithRelations {
  return {
    id: row.key,
    // TransactionItem memoizes on id + updatedAt, so encode the mutable fields
    // (notably the account, which the selector rewrites) to force a re-render.
    updatedAt: `${row.amount}|${row.categoryId}|${row.accountId}`,
    createdAt: '',
    deletedAt: null,
    type: 'expense',
    amount: row.amount,
    currency: row.currency,
    reportingCurrency: row.currency,
    reportingAmount: row.amount,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    date: row.date,
    accountId: row.accountId,
    fromAccountId: null,
    toAccountId: null,
    categoryId: row.categoryId,
    note: row.note,
    receiptUri,
    recurrencePattern: 'none',
    recurrenceInterval: 0,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: row.sentiment,
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

export function ScanReviewScreen({ onClose }: ScanReviewScreenProps) {
  const { jobs, completeJob, dismissJob } = useReceiptScans();
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
  const job = jobId ? (jobs.find((j) => j.id === jobId) ?? null) : null;

  // Local working copy — leaving the review (swipe back) discards everything, so
  // selection and account edits never need to persist to context.
  const [rows, setRows] = useState<RowState[]>(() =>
    job ? job.drafts.map((d, i) => ({ ...d, key: `scan-${i}`, selected: true })) : [],
  );
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [bulkAccountId, setBulkAccountId] = useState<string | null>(() => {
    if (quickEntryPrefs.defaultAccountId) return quickEntryPrefs.defaultAccountId;
    const sorted = [...accounts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return sorted[0]?.id ?? null;
  });

  // Approve sets this so the unmount cleanup keeps the (now-attached) receipt.
  const committedRef = useRef(false);
  const didCloseRef = useRef(false);

  // Job gone (approved) or a cold restore → close once.
  useEffect(() => {
    if (!job && !didCloseRef.current) {
      didCloseRef.current = true;
      onClose();
    }
  }, [job, onClose]);

  // Leaving the review without approving discards the whole scan — delete the
  // receipt and drop the job (also clears the home banner).
  useEffect(() => {
    return () => {
      if (!committedRef.current && jobId) dismissJob(jobId);
    };
  }, [jobId, dismissJob]);

  if (!job) return null;

  const receiptUri = job.receiptUri;
  const resolvedReceiptUri = getReceiptUri(receiptUri);
  const displaySettings = {
    currencySymbol: settings.currencySymbol,
    displayMode: settings.displayMode,
  };
  const selectedAccount = accounts.find((a) => a.id === bulkAccountId) ?? null;
  const selectedCount = rows.filter((r) => r.selected).length;

  const toggleSelected = (key: string) => {
    void triggerHaptic('selection');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  };

  const handleSelectAccount = (id: string) => {
    setBulkAccountId(id);
    setRows((prev) => prev.map((r) => ({ ...r, accountId: id })));
    setAccountPickerVisible(false);
  };

  const handleApprove = () => {
    const toSave = rows.filter((r) => r.selected && r.amount > 0);
    if (toSave.length === 0) return;
    void triggerHaptic('success');
    committedRef.current = true;
    let firstId: string | null = null;
    toSave.forEach((row) => {
      const id = createTransaction(
        {
          type: 'expense',
          amount: row.amount,
          currency: row.currency,
          date: row.date,
          accountId: row.accountId,
          categoryId: row.categoryId,
          note: row.note,
          sentiment: row.sentiment,
          receiptUri: receiptUri ?? null,
        },
        { source: 'receipt' },
      );
      if (!firstId) firstId = id;
    });
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_SAVED, { count: toSave.length });
    if (firstId) requestHighlightTransaction(firstId);
    completeJob(job.id); // removes the job → the close effect pops the screen
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onClose}
        title={I18n.t('receiptScan.review_title', { count: rows.length })}
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

        {rows.map((row) => {
          const category = categories.find((c) => c.id === row.categoryId) ?? null;
          const account = accounts.find((a) => a.id === row.accountId) ?? null;
          const transaction = draftToTransaction(row, receiptUri, category, account);
          return (
            <TransactionItem
              key={row.key}
              transaction={transaction}
              settings={displaySettings}
              getTrueHourlyRateForDate={getTrueHourlyRateForDate}
              onPressTransaction={() => toggleSelected(row.key)}
              selectionMode
              selected={row.selected}
              hideAccent
              showDateInSubtitle
              disableAnimations
            />
          );
        })}
      </ScrollView>

      <View className="px-5 pb-8 pt-2">
        <Button onPress={handleApprove} disabled={selectedCount === 0} className="w-full">
          <Text>{I18n.t('receiptScan.approve', { count: selectedCount })}</Text>
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
