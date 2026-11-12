import { ChevronRight, Pencil, ReceiptText, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  partPaidBullet,
  SettleUpSectionHeader,
  SettleUpShareList,
  type SettleUpShareSection,
} from '~/features/transactions/components/SettleUpShareList';
import type { ReceiptContent } from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { personInitial } from '~/features/transactions/lib/personAvatar';
import { personItemNames } from '~/features/transactions/lib/receiptSplitShare';
import { buildSettleUpShareCards } from '~/features/transactions/lib/settleUpDateGroups';
import { useSettleUpByTransaction } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionDebtSplit } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate } from '~/utils/formatters';

interface SettleUpTransactionScreenProps {
  transactionId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  /** Open the full transaction editor for this bill. */
  onEdit: () => void;
  /** Open the itemized receipt-split editor for this bill. */
  onOpenReceiptSplit: () => void;
}

export function SettleUpTransactionScreen({
  transactionId,
  onBack,
  onOpenSettings,
  onEdit,
  onOpenReceiptSplit,
}: SettleUpTransactionScreenProps) {
  const themeColors = useThemeColors();
  const { settings, getReceiptSplitForTransaction } = useApp();

  const [shareVisible, setShareVisible] = useState(false);

  const summary = useSettleUpByTransaction();

  const bill = useMemo(
    () => summary.transactions.find((t) => t.transactionId === transactionId) ?? null,
    [summary.transactions, transactionId],
  );
  // Every share here is from the one bill, so the page heads its cards by
  // what is still owed and what is paid back rather than by date.
  const sections = useMemo<SettleUpShareSection<TransactionDebtSplit>[]>(() => {
    if (!bill) return [];
    const { owed, settled } = buildSettleUpShareCards(bill.splits);
    const result: SettleUpShareSection<TransactionDebtSplit>[] = [];
    if (owed.length > 0) {
      result.push({
        key: 'owed',
        header: <SettleUpSectionHeader title={I18n.t('transactions.settleUp.section_owed')} />,
        cards: owed,
      });
    }
    if (settled.length > 0) {
      result.push({
        key: 'paid',
        header: <SettleUpSectionHeader title={I18n.t('transactions.settleUp.section_paid')} />,
        cards: settled,
      });
    }
    return result;
  }, [bill]);
  const locale = settings.locale ?? I18n.locale ?? 'en';

  // Paid-only bills remain in the summary; leave only after all shares are removed.
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

  // Non-reactive read; re-checked whenever the bill's splits refresh. Only an
  // itemized bill offers the "Itemized receipt" row — a plain Split Bill can't
  // be converted to Split by Item.
  const receiptRecord = useMemo(
    () => getReceiptSplitForTransaction(transactionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the splits refresh
    [getReceiptSplitForTransaction, transactionId, bill],
  );
  const hasItemizedDetail = receiptRecord !== null;

  // Blank while the bill is missing (the last share was removed) so the header
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
      lines: bill.splits
        .filter((split) => !split.paidAt)
        .map((split) => ({
          key: split.splitId,
          initial: personInitial(split.personName),
          label: split.personName ?? I18n.t('transactions.settleUp.someone'),
          // Itemized bills list what each person had as bullet points; a
          // share paid in parts says how much of it is paid.
          bullets: [
            ...(receiptRecord ? (personItemNames(receiptRecord, split.personName) ?? []) : []),
            ...partPaidBullet(split, formatNative),
          ],
          amount: formatNative(split.amount, split.currency),
        })),
    };
  }, [bill, title, formatNative, receiptRecord]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        fitActions
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
              {/* A bill a friend paid is owed the other way: the user's own share, to them. */}
              {bill.paidBy ? (
                <Text variant="caption" tone="muted" className="mt-2 text-center">
                  {I18n.t(
                    bill.unpaidSplitCount > 0
                      ? 'transactions.settleUp.section_you_owe'
                      : 'transactions.settleUp.you_paid_back',
                    { name: bill.paidBy.name ?? I18n.t('transactions.settleUp.someone') },
                  )}
                </Text>
              ) : bill.unpaidSplitCount > 0 ? (
                <Text variant="caption" tone="muted" className="mt-2">
                  {I18n.t('transactions.settleUp.section_owed')}
                </Text>
              ) : null}
              <Text
                variant="title"
                className={cn(
                  'text-center',
                  bill.paidBy && bill.unpaidSplitCount > 0 ? 'text-destructive' : '',
                )}
              >
                {formatNative(
                  bill.unpaidSplitCount === 0 ? bill.paidNative : bill.totalNative,
                  bill.currency,
                )}
              </Text>
              {bill.paidBy && bill.billTotalNative !== null ? (
                <Text variant="caption" tone="muted" className="mt-1 text-center">
                  {I18n.t('transactions.settleUp.person_paid_total', {
                    name: bill.paidBy.name ?? I18n.t('transactions.settleUp.someone'),
                    amount: formatNative(bill.billTotalNative, bill.currency),
                  })}
                </Text>
              ) : null}
              {bill.unpaidSplitCount > 0 && bill.paidNative > 0 ? (
                <View className="mt-3 w-full items-center px-6">
                  <View className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-secondary/60">
                    <View
                      className="h-full rounded-full bg-success"
                      style={{
                        width: `${(bill.paidNative / (bill.paidNative + bill.totalNative)) * 100}%`,
                      }}
                    />
                  </View>
                  <Text variant="caption" tone="muted" className="mt-1.5 text-center">
                    {I18n.t('transactions.settleUp.bill_paid_progress', {
                      paid: formatNative(bill.paidNative, bill.currency),
                      total: formatNative(bill.paidNative + bill.totalNative, bill.currency),
                    })}
                  </Text>
                </View>
              ) : (
                <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
              )}
            </View>

            {hasItemizedDetail ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onOpenReceiptSplit();
                }}
                accessibilityRole="button"
                className="mt-4 flex-row items-center gap-3 rounded-2xl border border-border/25 bg-secondary/30 px-4 py-3 active:opacity-70"
              >
                <ReceiptText size={18} color={themeColors.primary} />
                <View className="flex-1">
                  <Text variant="bodyStrong">
                    {I18n.t('transactions.receiptSplit.itemized_receipt')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.receiptSplit.view_items_hint')}
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
            ) : null}

            <SettleUpShareList
              sections={sections}
              locale={locale}
              renderLeading={(split) => (
                <Text variant="bodyStrong">{personInitial(split.personName)}</Text>
              )}
              label={(split) => split.personName ?? I18n.t('transactions.settleUp.someone')}
            />

            {/* How a bill a friend paid was shared out. Only the user's own
                share is theirs to settle; the rest is between the others. */}
            {bill.paidBy && bill.participants.length > 0 ? (
              <View className="mt-4">
                <SettleUpSectionHeader title={I18n.t('transactions.settleUp.everyone_share')} />
                <View className="mt-1 overflow-hidden rounded-2xl border border-border/25 bg-card/60">
                  {[
                    {
                      key: 'me',
                      name: I18n.t('transactions.editor.split.me_label'),
                      amount: bill.splits[0]?.shareTotal ?? 0,
                      isPayer: false,
                    },
                    ...bill.participants.map((participant) => ({
                      key: participant.splitId,
                      name: participant.personName ?? I18n.t('transactions.settleUp.someone'),
                      amount: participant.amount,
                      isPayer: participant.isPayer,
                    })),
                  ].map((row, index) => (
                    <View
                      key={row.key}
                      className={cn(
                        'flex-row items-center gap-2.5 px-4 py-3',
                        index > 0 ? 'border-t border-border/15' : '',
                      )}
                    >
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary/50">
                        <Text variant="caption" className="font-semibold">
                          {personInitial(row.name)}
                        </Text>
                      </View>
                      <Text variant="body" numberOfLines={1} className="shrink">
                        {row.name}
                      </Text>
                      {row.isPayer ? (
                        <View className="rounded-full bg-success/15 px-2 py-0.5">
                          <Text variant="caption" className="font-medium text-success">
                            {I18n.t('transactions.editor.split.payer_tag')}
                          </Text>
                        </View>
                      ) : null}
                      <View className="flex-1" />
                      <Text variant="body" tone="muted">
                        {formatNative(row.amount, bill.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {bill.unpaidSplitCount > 0 && !bill.paidBy ? (
            <View className="px-5 pb-8 pt-2">
              <Button onPress={handleShare} className="w-full gap-2">
                <Send size={18} color="#fff" />
                <Text>{I18n.t('transactions.settleUp.share_receipt')}</Text>
              </Button>
            </View>
          ) : null}

          <SplitReceiptShareModal
            visible={shareVisible}
            onClose={() => setShareVisible(false)}
            content={receiptContent}
            itemCount={bill.unpaidSplitCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
