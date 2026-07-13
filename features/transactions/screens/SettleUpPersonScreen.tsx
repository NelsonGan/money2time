import { Check, ChevronDown, Send, Trash2 } from 'lucide-react-native';
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
import { parseSharedItemNote } from '~/features/transactions/lib/settleUp';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatRelativeDate, formatShortDate } from '~/utils/formatters';

interface SettleUpPersonScreenProps {
  personKey: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

export function SettleUpPersonScreen({
  personKey,
  onBack,
  onOpenSettings,
}: SettleUpPersonScreenProps) {
  const themeColors = useThemeColors();
  const {
    settings,
    accounts,
    accountGroups,
    getAccountById,
    markSplitPaid,
    updateSplitPaybackAccount,
    deleteSplit,
  } = useApp();

  const [pickerForSplitId, setPickerForSplitId] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  const summary = useSettleUpSummary();

  const person = useMemo(
    () => summary.people.find((p) => p.key === personKey) ?? null,
    [summary.people, personKey],
  );

  // When the last bill is settled the person drops out of the summary; leave the
  // page so we never sit on an empty tab.
  useEffect(() => {
    if (!person) onBack();
  }, [person, onBack]);

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );
  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

  const handleShare = useCallback(() => {
    void triggerHaptic('selection');
    setShareVisible(true);
  }, []);

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

  const pickerBill = useMemo(
    () => person?.bills.find((b) => b.splitId === pickerForSplitId) ?? null,
    [person, pickerForSplitId],
  );

  // Blank while the person is missing (the last bill just settled) so the header
  // doesn't flash a fallback name for the one frame before the screen pops.
  const title = person ? (person.name ?? `${I18n.t('transactions.settleUp.someone')}`) : '';

  // Receipt: title is the person's name, one line per bill with its date. A
  // person can owe several items on the same transaction (their own item plus a
  // shared line); group those by transaction so the bill shows once, with the
  // items bulleted underneath instead of repeating the transaction per item.
  const receiptContent = useMemo<ReceiptContent | null>(() => {
    if (!person) return null;
    const sharedLabel = I18n.t('transactions.editor.split.shared_label');
    interface GroupItem {
      key: string;
      name: string;
      shared: boolean;
    }
    interface TxGroup {
      key: string;
      billLabel: string;
      categoryIcon: string | null;
      date: string;
      amount: number;
      currency: string;
      items: GroupItem[];
    }
    const order: string[] = [];
    const groups = new Map<string, TxGroup>();
    for (const bill of person.bills) {
      let group = groups.get(bill.transactionId);
      if (!group) {
        group = {
          key: bill.splitId,
          billLabel:
            bill.note?.trim() || bill.categoryName || I18n.t('transactions.settleUp.untitled_bill'),
          categoryIcon: bill.categoryIcon,
          date: bill.date,
          amount: 0,
          currency: bill.currency,
          items: [],
        };
        groups.set(bill.transactionId, group);
        order.push(bill.transactionId);
      }
      group.amount += bill.amount;
      if (bill.itemNote?.trim()) {
        const parsed = parseSharedItemNote(bill.itemNote, sharedLabel);
        group.items.push({ key: bill.splitId, name: parsed.name, shared: parsed.shared });
      }
    }
    return {
      title,
      subtitle: null,
      sharedLabel,
      totalLabel: I18n.t('transactions.settleUp.receipt_total_label'),
      totalText: person.byCurrency.map((c) => formatNative(c.amount, c.currency)).join(' + '),
      lines: order.map((key) => {
        const group = groups.get(key)!;
        // Bullets when there are several items OR any shared item (so its badge
        // shows); a single plain item stands in for the whole line's label. The
        // date is always the sublabel.
        const useBullets = group.items.length > 1 || group.items.some((it) => it.shared);
        return {
          key: group.key,
          categoryIcon: group.categoryIcon,
          label: !useBullets && group.items.length === 1 ? group.items[0]!.name : group.billLabel,
          sublabel: formatShortDate(group.date),
          items: useBullets ? group.items : null,
          amount: formatNative(group.amount, group.currency),
        };
      }),
    };
  }, [person, title, formatNative]);

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={title} />
      {person ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          >
            <View className="rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-4">
              <Text variant="caption" tone="muted" className="uppercase tracking-wide">
                {I18n.t('transactions.settleUp.person_owes_label')}
              </Text>
              <Text variant="heading" className="mt-1 text-3xl">
                {formatReporting(person.totalReporting)}
              </Text>
            </View>

            <View className="mt-4 gap-2">
              {person.bills.map((bill) => {
                const account = bill.paybackAccountId
                  ? getAccountById(bill.paybackAccountId)
                  : null;
                return (
                  <View
                    key={bill.splitId}
                    className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                        <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
                      </View>
                      <View className="flex-1">
                        {/* Item name stands in for the whole line when present;
                            otherwise the bill's note/category. Never both. */}
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {bill.itemNote?.trim() ||
                            bill.note?.trim() ||
                            bill.categoryName ||
                            I18n.t('transactions.settleUp.untitled_bill')}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {formatRelativeDate(bill.date)}
                        </Text>
                      </View>
                      <Text variant="bodyStrong">{formatNative(bill.amount, bill.currency)}</Text>
                    </View>

                    <View className="my-3 h-px bg-border/15" />

                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setPickerForSplitId(bill.splitId);
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
                        onPress={() => handleDelete(bill.splitId)}
                        hitSlop={8}
                        className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10 active:opacity-70"
                      >
                        <Trash2 size={15} color={themeColors.error} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleMarkPaid(bill.splitId)}
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
            selectedAccountId={pickerBill?.paybackAccountId ?? null}
            onSelect={(accountId) => {
              if (pickerForSplitId) updateSplitPaybackAccount(pickerForSplitId, accountId);
              setPickerForSplitId(null);
            }}
          />

          <SplitReceiptShareModal
            visible={shareVisible}
            onClose={() => setShareVisible(false)}
            content={receiptContent}
            itemCount={person.billCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
