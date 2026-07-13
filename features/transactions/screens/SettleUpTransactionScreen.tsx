import { Check, ChevronDown, Pencil, Send, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  AccountLogo,
  AccountPickerSheet,
  Button,
  CategoryEmoji,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import type { ReceiptContent } from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { useSettleUpByTransaction } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate } from '~/utils/formatters';

interface SettleUpTransactionScreenProps {
  transactionId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  /** Open the full transaction editor for this bill. */
  onEdit: () => void;
}

function personInitial(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}

export function SettleUpTransactionScreen({
  transactionId,
  onBack,
  onOpenSettings,
  onEdit,
}: SettleUpTransactionScreenProps) {
  const themeColors = useThemeColors();
  const {
    accounts,
    accountGroups,
    getAccountById,
    markSplitPaid,
    updateSplitPaybackAccount,
    deleteSplit,
  } = useApp();

  const [pickerForSplitId, setPickerForSplitId] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  const summary = useSettleUpByTransaction();

  const bill = useMemo(
    () => summary.transactions.find((t) => t.transactionId === transactionId) ?? null,
    [summary.transactions, transactionId],
  );

  // When the last share is settled the bill drops out of the summary; leave the
  // page so we never sit on an empty screen.
  useEffect(() => {
    if (!bill) onBack();
  }, [bill, onBack]);

  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

  const handleShare = useCallback(() => {
    void triggerHaptic('selection');
    setShareVisible(true);
  }, []);

  const handleEdit = useCallback(() => {
    void triggerHaptic('selection');
    onEdit();
  }, [onEdit]);

  const handleMarkPaid = useCallback(
    (splitId: string) => {
      void triggerHaptic('success');
      markSplitPaid(splitId);
    },
    [markSplitPaid],
  );

  const handleDelete = useCallback(
    (splitId: string) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('transactions.settleUp.remove_bill_title'),
        I18n.t('transactions.settleUp.remove_bill_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.remove'),
            style: 'destructive',
            onPress: () => deleteSplit(splitId),
          },
        ],
      );
    },
    [deleteSplit],
  );

  const pickerSplit = useMemo(
    () => bill?.splits.find((s) => s.splitId === pickerForSplitId) ?? null,
    [bill, pickerForSplitId],
  );

  // Blank while the bill is missing (the last share just settled) so the header
  // doesn't flash a fallback title for the one frame before the screen pops.
  const title = bill
    ? bill.note?.trim() || bill.categoryName || `${I18n.t('transactions.settleUp.untitled_bill')}`
    : '';

  // Receipt: title is the bill, the date sits on top, one line per person.
  // No grand total — the card goes to a group, so each person only cares about
  // their own line.
  const receiptContent = useMemo<ReceiptContent | null>(() => {
    if (!bill) return null;
    return {
      title,
      subtitle: formatShortDate(bill.date),
      lines: bill.splits.map((split) => ({
        key: split.splitId,
        initial: personInitial(split.personName),
        label: split.personName ?? I18n.t('transactions.settleUp.someone'),
        amount: formatNative(split.amount, split.currency),
      })),
    };
  }, [bill, title, formatNative]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={title}
        rightAccessory={
          bill ? (
            <Pressable
              onPress={handleEdit}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.edit')}
              className="h-9 flex-row items-center gap-1 rounded-full bg-secondary/60 px-3 active:opacity-70"
            >
              <Pencil size={14} color={themeColors.text} />
              <Text variant="caption" className="font-medium">
                {I18n.t('common.edit')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      {bill ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          >
            <View className="items-center px-4 pt-2 pb-2">
              <View className="flex-row items-center gap-1.5">
                <CategoryEmoji icon={bill.categoryIcon} size={16} />
                <Text variant="caption" tone="muted">
                  {formatShortDate(bill.date)}
                </Text>
              </View>
              <Text variant="title" className="mt-1 text-center">
                {formatNative(bill.totalNative, bill.currency)}
              </Text>
              <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
            </View>

            <View className="mt-4 gap-2">
              {bill.splits.map((split) => {
                const account = split.paybackAccountId
                  ? getAccountById(split.paybackAccountId)
                  : null;
                return (
                  <View
                    key={split.splitId}
                    className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                        <Text variant="bodyStrong">{personInitial(split.personName)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {split.personName ?? I18n.t('transactions.settleUp.someone')}
                        </Text>
                      </View>
                      <Text variant="bodyStrong">{formatNative(split.amount, split.currency)}</Text>
                    </View>

                    <View className="my-3 h-px bg-border/15" />

                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setPickerForSplitId(split.splitId);
                        }}
                        className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5 active:opacity-70"
                      >
                        {account ? (
                          <AccountLogo logoId={account.logoId} type={account.type} size={16} />
                        ) : null}
                        <Text
                          variant="caption"
                          tone="muted"
                          numberOfLines={1}
                          className="max-w-[150px]"
                        >
                          {account?.name ?? I18n.t('common.no_account')}
                        </Text>
                        <ChevronDown size={12} color={themeColors.textMuted} />
                      </Pressable>
                      <View className="flex-1" />
                      <Pressable
                        onPress={() => handleDelete(split.splitId)}
                        hitSlop={8}
                        className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10 active:opacity-70"
                      >
                        <Trash2 size={15} color={themeColors.error} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleMarkPaid(split.splitId)}
                        hitSlop={8}
                        className="flex-row items-center gap-1 rounded-full bg-success/15 px-3.5 py-2 active:opacity-70"
                      >
                        <Check size={14} color={themeColors.success} />
                        <Text variant="caption" className="text-success font-medium">
                          {I18n.t('transactions.editor.split.mark_paid')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View className="px-5 pb-8 pt-2">
            <Button onPress={handleShare} className="w-full gap-2">
              <Send size={18} color="#fff" />
              <Text>{I18n.t('transactions.settleUp.share_receipt')}</Text>
            </Button>
          </View>

          <AccountPickerSheet
            visible={pickerForSplitId !== null}
            onClose={() => setPickerForSplitId(null)}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedAccountId={pickerSplit?.paybackAccountId ?? null}
            onSelect={(accountId) => {
              if (pickerForSplitId) updateSplitPaybackAccount(pickerForSplitId, accountId);
              setPickerForSplitId(null);
            }}
          />

          <SplitReceiptShareModal
            visible={shareVisible}
            onClose={() => setShareVisible(false)}
            content={receiptContent}
            itemCount={bill.splitCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
