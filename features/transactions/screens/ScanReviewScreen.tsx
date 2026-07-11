import { Image } from 'expo-image';
import { Calendar, Check, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DatePickerModal } from '~/components/datePicker/DatePickerModal';
import {
  AccountLogo,
  AccountPickerSheet,
  Button,
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  Input,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { consumePendingScanReview } from '~/features/transactions/lib/scanReviewBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { ScanDraft } from '~/services/receiptScan';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { deleteReceiptImage, getReceiptUri } from '~/services/userAssets';
import type { Category, TransactionType } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatShortDate } from '~/utils/formatters';

interface ScanReviewScreenProps {
  onClose: () => void;
}

interface RowState extends ScanDraft {
  key: string;
  amountText: string;
  /** Approved rows are the ones "Approve" saves. All rows start approved. */
  selected: boolean;
}

interface ActivePicker {
  rowKey: string;
  kind: 'category' | 'account' | 'date';
  type: TransactionType;
}

function buildCategoryPickerOptions(categories: Category[]): {
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
} {
  const parents: CategoryPickerOption[] = [];
  const childByParent = new Map<string, CategoryPickerOption[]>();
  const parentIds = new Set<string>();
  categories.forEach((category) => {
    if (!category.parentId) {
      parents.push({ id: category.id, name: category.name, icon: category.icon });
      parentIds.add(category.id);
    }
  });
  categories.forEach((category) => {
    if (category.parentId && parentIds.has(category.parentId)) {
      const list = childByParent.get(category.parentId) ?? [];
      list.push({ id: category.id, name: category.name, icon: category.icon });
      childByParent.set(category.parentId, list);
    }
  });
  return { parents, childByParent };
}

export function ScanReviewScreen({ onClose }: ScanReviewScreenProps) {
  const { createTransaction, categories, accounts, accountGroups, isSimpleMode } = useApp();
  const themeColors = useThemeColors();

  const [rows, setRows] = useState<RowState[]>([]);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
  // Which row is expanded for editing (tap a row to open its editor).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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

  const toggleExpanded = useCallback((key: string) => {
    void triggerHaptic('selection');
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const pickerCategories = useMemo(() => {
    if (!activePicker) return [];
    return categories.filter((c) => c.type === activePicker.type);
  }, [activePicker, categories]);

  const categoryPickerOptions = useMemo(
    () => buildCategoryPickerOptions(pickerCategories),
    [pickerCategories],
  );

  const activeRow = useMemo(
    () => rows.find((r) => r.key === activePicker?.rowKey) ?? null,
    [rows, activePicker],
  );

  // A row counts toward "Approve" only if it's selected AND has a valid amount.
  const approvableCount = rows.filter(
    (r) => r.selected && Number.parseFloat(r.amountText) > 0,
  ).length;

  const handleApprove = useCallback(() => {
    const toSave = rows.filter((r) => r.selected && Number.parseFloat(r.amountText) > 0);
    if (toSave.length === 0) return;
    void triggerHaptic('success');
    let firstId: string | null = null;
    toSave.forEach((row) => {
      const amount = Number.parseFloat(row.amountText);
      const id = createTransaction(
        {
          type: row.type,
          amount,
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
          const symbol = currencySymbolForCode(row.currency);
          const expanded = expandedKey === row.key;
          return (
            <View
              key={row.key}
              className="mb-3 rounded-[24px] border border-border/30 bg-card px-3 py-3"
              style={{ opacity: row.selected ? 1 : 0.55 }}
            >
              {/* Summary row: selection checkbox + tap-to-edit body */}
              <View className="flex-row items-center gap-3">
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

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('receiptScan.edit_row')}
                  onPress={() => toggleExpanded(row.key)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  className="flex-1 flex-row items-center gap-3"
                >
                  <CategoryEmoji icon={category?.icon} size={30} />
                  <View className="flex-1">
                    <Text variant="body" className="font-medium" numberOfLines={1}>
                      {category?.name ?? I18n.t('transactions.editor.choose_category')}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {row.note?.trim() ? `${row.note.trim()} · ` : ''}
                      {formatShortDate(row.date)}
                    </Text>
                  </View>
                  <Text variant="subheading" className="font-semibold">
                    {symbol}
                    {row.amountText || '0'}
                  </Text>
                  <ChevronRight
                    size={18}
                    color={themeColors.textMuted}
                    style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
                  />
                </Pressable>
              </View>

              {expanded ? (
                <View className="mt-3 border-t border-border/30 pt-3">
                  <View className="flex-row items-center gap-2">
                    <Text variant="subheading" tone="muted">
                      {symbol}
                    </Text>
                    <Input
                      className="flex-1"
                      keyboardType="decimal-pad"
                      value={row.amountText}
                      onChangeText={(t) => updateRow(row.key, { amountText: t })}
                      placeholder="0"
                    />
                  </View>

                  <SelectorRow
                    label={I18n.t('transactions.editor.category')}
                    onPress={() =>
                      setActivePicker({ rowKey: row.key, kind: 'category', type: row.type })
                    }
                    accessory={themeColors.textMuted}
                  >
                    {category ? (
                      <View className="flex-row items-center gap-2">
                        <CategoryEmoji icon={category.icon} size={20} />
                        <Text variant="body">{category.name}</Text>
                      </View>
                    ) : (
                      <Text variant="body" tone="muted">
                        {I18n.t('transactions.editor.choose_category')}
                      </Text>
                    )}
                  </SelectorRow>

                  {!isSimpleMode ? (
                    <SelectorRow
                      label={I18n.t('transactions.editor.account')}
                      onPress={() =>
                        setActivePicker({ rowKey: row.key, kind: 'account', type: row.type })
                      }
                      accessory={themeColors.textMuted}
                    >
                      {account ? (
                        <View className="flex-row items-center gap-2">
                          <AccountLogo logoId={account.logoId} type={account.type} size={20} />
                          <Text variant="body">{account.name}</Text>
                        </View>
                      ) : (
                        <Text variant="body" tone="muted">
                          {I18n.t('transactions.editor.choose_account')}
                        </Text>
                      )}
                    </SelectorRow>
                  ) : null}

                  <SelectorRow
                    label={I18n.t('transactions.editor.date')}
                    onPress={() =>
                      setActivePicker({ rowKey: row.key, kind: 'date', type: row.type })
                    }
                    accessory={themeColors.textMuted}
                    icon={<Calendar size={16} color={themeColors.textMuted} />}
                  >
                    <Text variant="body">{formatShortDate(row.date)}</Text>
                  </SelectorRow>

                  <View className="mt-3">
                    <Input
                      value={row.note ?? ''}
                      onChangeText={(t) => updateRow(row.key, { note: t.length > 0 ? t : null })}
                      placeholder={I18n.t('receiptScan.note_placeholder')}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {rows.length === 0 ? (
          <Text variant="body" tone="muted" className="mt-8 text-center">
            {I18n.t('receiptScan.all_removed')}
          </Text>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-8 pt-2">
        <Button onPress={handleApprove} disabled={approvableCount === 0} className="w-full">
          <Text>{I18n.t('receiptScan.approve', { count: approvableCount })}</Text>
        </Button>
      </View>

      <CategoryPickerSheet
        visible={activePicker?.kind === 'category'}
        parents={categoryPickerOptions.parents}
        childByParent={categoryPickerOptions.childByParent}
        selectedCategoryId={activeRow?.categoryId ?? null}
        onSelect={(id) => {
          if (activePicker) updateRow(activePicker.rowKey, { categoryId: id });
          setActivePicker(null);
        }}
        onClose={() => setActivePicker(null)}
        allowParentSelection
      />

      <AccountPickerSheet
        visible={activePicker?.kind === 'account'}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={activeRow?.accountId ?? null}
        onSelect={(id) => {
          if (activePicker) updateRow(activePicker.rowKey, { accountId: id });
          setActivePicker(null);
        }}
        onClose={() => setActivePicker(null)}
      />

      <DatePickerModal
        visible={activePicker?.kind === 'date'}
        value={activeRow?.date ?? ''}
        onSelect={(date) => {
          if (activePicker) updateRow(activePicker.rowKey, { date });
          setActivePicker(null);
        }}
        onClose={() => setActivePicker(null)}
      />
    </SettingsPageLayout>
  );
}

interface SelectorRowProps {
  label: string;
  onPress: () => void;
  accessory: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function SelectorRow({ label, onPress, accessory, icon, children }: SelectorRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="mt-3 flex-row items-center justify-between gap-2"
    >
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View className="flex-row items-center gap-1.5">
        {icon}
        {children}
        <ChevronRight size={16} color={accessory} />
      </View>
    </Pressable>
  );
}
