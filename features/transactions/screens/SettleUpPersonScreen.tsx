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
import { SettleUpDateHeader } from '~/features/transactions/components/SettleUpDateHeader';
import type {
  ReceiptContent,
  ReceiptLine,
} from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { personItemNames } from '~/features/transactions/lib/receiptSplitShare';
import { groupSettleUpItemsByDate } from '~/features/transactions/lib/settleUpDateGroups';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate } from '~/utils/formatters';

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
    getReceiptSplitForTransaction,
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
  const dateGroups = useMemo(
    () =>
      person ? groupSettleUpItemsByDate(person.bills, (bill) => bill.paidAt ?? bill.date) : [],
    [person],
  );
  const locale = settings.locale ?? I18n.locale ?? 'en';

  // A paid-only person remains in the summary; leave only after all shares are removed.
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

  // Blank while the person is missing (the last share was removed) so the header
  // doesn't flash a fallback name for the one frame before the screen pops.
  const title = person ? (person.name ?? `${I18n.t('transactions.settleUp.someone')}`) : '';

  // Receipt: title is the person's name, one line per bill with its date. A
  // bill saved through Split by Item lists the person's items as bullets.
  const receiptContent = useMemo<ReceiptContent | null>(() => {
    if (!person) return null;
    return {
      title,
      subtitle: null,
      totalLabel: I18n.t('transactions.settleUp.receipt_total_label'),
      totalText: person.byCurrency.map((c) => formatNative(c.amount, c.currency)).join(' + '),
      lines: person.bills
        .filter((bill) => !bill.paidAt)
        .map((bill): ReceiptLine => {
          const record = getReceiptSplitForTransaction(bill.transactionId);
          return {
            key: bill.splitId,
            categoryIcon: bill.categoryIcon,
            label:
              bill.note?.trim() ||
              bill.categoryName ||
              I18n.t('transactions.settleUp.untitled_bill'),
            sublabel: formatShortDate(bill.date),
            bullets: record ? (personItemNames(record, person.name) ?? []) : [],
            amount: formatNative(bill.amount, bill.currency),
          };
        }),
    };
  }, [person, title, formatNative, getReceiptSplitForTransaction]);

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={title} />
      {person ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          >
            <View className="items-center px-4 pt-2 pb-2">
              {person.unpaidBillCount > 0 ? (
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.settleUp.person_owes_label')}
                </Text>
              ) : null}
              <Text variant="title" className="text-center">
                {formatReporting(
                  person.unpaidBillCount === 0 ? person.paidReporting : person.totalReporting,
                )}
              </Text>
              <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
            </View>

            <View className="mt-4 gap-3">
              {dateGroups.map((group) => (
                <View key={group.dayKey} className="gap-2">
                  <SettleUpDateHeader dayKey={group.dayKey} locale={locale} />
                  {group.items.map((bill) => {
                    const account = bill.paybackAccountId
                      ? getAccountById(bill.paybackAccountId)
                      : null;
                    return (
                      <View
                        key={bill.splitId}
                        className={
                          bill.paidAt
                            ? 'rounded-2xl border border-border/15 bg-secondary/20 px-4 py-3.5'
                            : 'rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5'
                        }
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                            <CategoryEmoji
                              icon={bill.categoryIcon}
                              size={22}
                              className="text-[19px]"
                            />
                          </View>
                          <View className="flex-1">
                            <Text
                              variant="bodyStrong"
                              tone={bill.paidAt ? 'muted' : undefined}
                              numberOfLines={1}
                            >
                              {bill.note?.trim() ||
                                bill.categoryName ||
                                I18n.t('transactions.settleUp.untitled_bill')}
                            </Text>
                          </View>
                          <Text variant="bodyStrong" tone={bill.paidAt ? 'muted' : undefined}>
                            {formatNative(bill.amount, bill.currency)}
                          </Text>
                        </View>

                        {!bill.paidAt ? (
                          <View className="mt-2 flex-row items-center gap-2">
                            <Pressable
                              onPress={() => {
                                void triggerHaptic('selection');
                                setPickerForSplitId(bill.splitId);
                              }}
                              className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5 active:opacity-70"
                            >
                              {account ? (
                                <AccountLogo
                                  logoId={account.logoId}
                                  type={account.type}
                                  goalEmoji={account.goalEmoji}
                                  size={16}
                                />
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
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

          {person.unpaidBillCount > 0 ? (
            <View className="px-5 pb-8 pt-2">
              <Button onPress={handleShare} className="w-full gap-2">
                <Send size={18} color="#fff" />
                <Text>{I18n.t('transactions.settleUp.share_receipt')}</Text>
              </Button>
            </View>
          ) : null}

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
            itemCount={person.unpaidBillCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
