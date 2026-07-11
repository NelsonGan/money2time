import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { setScanEditSession } from '~/features/transactions/lib/scanEditBridge';
import { consumePendingScanReview } from '~/features/transactions/lib/scanReviewBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { ScanDraft } from '~/services/receiptScan';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { deleteReceiptImage, getReceiptUri } from '~/services/userAssets';
import type { Account, Category, TransactionWithRelations } from '~/types';

interface ScanReviewScreenProps {
  onClose: () => void;
  /** Push the full transaction editor (ScanDraftEdit route). */
  openEditor: () => void;
}

interface RowState extends ScanDraft {
  key: string;
  amountText: string;
  /** Approved rows are the ones "Approve" saves. All rows start approved. */
  selected: boolean;
}

function rowToInitialValues(row: RowState): AddTransactionInitialValues {
  return {
    type: row.type,
    amount: row.amountText,
    date: row.date,
    accountId: row.accountId,
    fromAccountId: null,
    toAccountId: null,
    categoryId: row.categoryId,
    note: row.note ?? '',
    sentiment: row.sentiment,
    currency: row.currency,
    // Omit receiptUri: the shared receipt is attached once at Approve.
  };
}

/** Builds a display-only transaction from a draft so we can reuse TransactionItem. */
function draftToTransaction(
  row: RowState,
  receiptUri: string | null,
  category: Category | null,
  account: Account | null,
): TransactionWithRelations {
  const amount = Number.parseFloat(row.amountText) || 0;
  return {
    id: row.key,
    // TransactionItem memoizes on id + updatedAt, so encode the mutable fields
    // here to force a re-render after an edit.
    updatedAt: `${row.amountText}|${row.categoryId}|${row.accountId}|${row.date}|${row.note ?? ''}|${row.type}`,
    createdAt: '',
    deletedAt: null,
    type: row.type,
    amount,
    currency: row.currency,
    reportingCurrency: row.currency,
    reportingAmount: amount,
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

export function ScanReviewScreen({ onClose, openEditor }: ScanReviewScreenProps) {
  const { createTransaction, categories, accounts, settings, getTrueHourlyRateForDate } = useApp();
  const themeColors = useThemeColors();

  const [rows, setRows] = useState<RowState[]>([]);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  // Guards the unmount cleanup so we don't delete the receipt after saving it.
  const committedRef = useRef(false);
  const receiptRef = useRef<string | null>(null);

  // Consume the hand-off once on mount. A cold state restore leaves it empty →
  // there's nothing to review, so close.
  useEffect(() => {
    const session = consumePendingScanReview();
    if (!session || session.drafts.length === 0) {
      onClose();
      return;
    }
    setReceiptUri(session.receiptUri);
    receiptRef.current = session.receiptUri;
    setRows(
      session.drafts.map((draft, index) => ({
        ...draft,
        key: `scan-${index}`,
        amountText: String(draft.amount),
        selected: true,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orphan cleanup: if the screen unmounts (back/swipe) without saving, drop the
  // captured receipt so it doesn't linger unattached.
  useEffect(() => {
    return () => {
      if (!committedRef.current && receiptRef.current) {
        deleteReceiptImage(receiptRef.current);
      }
    };
  }, []);

  const updateRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const toggleSelected = useCallback((key: string) => {
    void triggerHaptic('selection');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  }, []);

  const openEdit = useCallback(
    (row: RowState) => {
      setScanEditSession({
        initialValues: rowToInitialValues(row),
        onDone: (input: CreateTransactionInput) =>
          updateRow(row.key, {
            type: input.type === 'income' ? 'income' : 'expense',
            amount: input.amount,
            amountText: String(input.amount),
            currency: input.currency,
            date: input.date,
            accountId: input.accountId ?? null,
            categoryId: input.categoryId ?? null,
            note: input.note ?? null,
            sentiment: input.sentiment ?? 'neutral',
          }),
      });
      openEditor();
    },
    [openEditor, updateRow],
  );

  const selectedRows = rows.filter((r) => r.selected);
  const canApprove =
    selectedRows.length > 0 && selectedRows.every((r) => Number.parseFloat(r.amountText) > 0);

  const handleApprove = useCallback(() => {
    const toSave = rows.filter((r) => r.selected && Number.parseFloat(r.amountText) > 0);
    if (toSave.length === 0) return;
    void triggerHaptic('success');
    let firstId: string | null = null;
    toSave.forEach((row) => {
      const id = createTransaction(
        {
          type: row.type,
          amount: Number.parseFloat(row.amountText),
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
    committedRef.current = true;
    void trackEvent(AnalyticsEvents.RECEIPT_SCAN_SAVED, { count: toSave.length });
    if (firstId) requestHighlightTransaction(firstId);
    onClose();
  }, [rows, createTransaction, receiptUri, onClose]);

  const resolvedReceiptUri = receiptUri ? getReceiptUri(receiptUri) : null;
  const displaySettings = {
    currencySymbol: settings.currencySymbol,
    displayMode: settings.displayMode,
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

        <Text variant="caption" tone="muted" className="mb-3">
          {I18n.t('receiptScan.review_hint')}
        </Text>

        {rows.map((row) => {
          const category = categories.find((c) => c.id === row.categoryId) ?? null;
          const account = accounts.find((a) => a.id === row.accountId) ?? null;
          const transaction = draftToTransaction(row, receiptUri, category, account);
          return (
            <View key={row.key} className="flex-row items-center gap-2.5">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.selected }}
                accessibilityLabel={I18n.t('receiptScan.approve_toggle')}
                hitSlop={8}
                onPress={() => toggleSelected(row.key)}
                className="h-7 w-7 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: row.selected ? themeColors.primary : themeColors.border,
                  backgroundColor: row.selected ? themeColors.primary : 'transparent',
                }}
              >
                {row.selected ? <Check size={16} color="#ffffff" /> : null}
              </Pressable>
              <View className="flex-1">
                <TransactionItem
                  transaction={transaction}
                  settings={displaySettings}
                  getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                  onPressTransaction={() => openEdit(row)}
                  showDateInSubtitle
                  disableAnimations
                />
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View className="px-5 pb-8 pt-2">
        <Button onPress={handleApprove} disabled={!canApprove} className="w-full">
          <Text>{I18n.t('receiptScan.approve', { count: selectedRows.length })}</Text>
        </Button>
      </View>
    </SettingsPageLayout>
  );
}
