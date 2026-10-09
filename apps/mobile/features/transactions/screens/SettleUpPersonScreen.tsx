import { Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { SettleUpShareList } from '~/features/transactions/components/SettleUpShareList';
import type {
  ReceiptContent,
  ReceiptLine,
} from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { personItemNames } from '~/features/transactions/lib/receiptSplitShare';
import { groupSettleUpItemsByDate } from '~/features/transactions/lib/settleUpDateGroups';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
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
  const { settings, getReceiptSplitForTransaction } = useApp();

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

            <SettleUpShareList
              groups={dateGroups}
              locale={locale}
              renderLeading={(bill) => (
                <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
              )}
              label={(bill) =>
                bill.note?.trim() ||
                bill.categoryName ||
                I18n.t('transactions.settleUp.untitled_bill')
              }
            />
          </ScrollView>

          {person.unpaidBillCount > 0 ? (
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
            itemCount={person.unpaidBillCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
