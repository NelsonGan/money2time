import { Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  type SettleUpConfirmContent,
  SettleUpConfirmSheet,
} from '~/features/transactions/components/SettleUpConfirmSheet';
import {
  partPaidBullet,
  SettleUpSectionHeader,
  SettleUpShareList,
  type SettleUpShareSection,
} from '~/features/transactions/components/SettleUpShareList';
import type {
  ReceiptContent,
  ReceiptLine,
} from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { avatarColor, personInitial } from '~/features/transactions/lib/personAvatar';
import { personItemNames } from '~/features/transactions/lib/receiptSplitShare';
import { personBalanceState } from '~/features/transactions/lib/settleUp';
import { buildSettleUpShareCards } from '~/features/transactions/lib/settleUpDateGroups';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PersonDebt, PersonDebtBill } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate } from '~/utils/formatters';

interface SettleUpPersonScreenProps {
  personKey: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

/**
 * The net with a person as it changes hands: in the bills' own currency when
 * they share one, else in the reporting currency (an estimate, so marked ≈).
 */
function netAmountText(
  person: PersonDebt,
  formatNative: (amount: number, currency: string) => string,
  formatReporting: (value: number) => string,
): string {
  if (person.netByCurrency.length === 1) {
    const [only] = person.netByCurrency;
    return formatNative(Math.abs(only!.amount), only!.currency);
  }
  const reporting = formatReporting(Math.abs(person.netReporting));
  return person.netByCurrency.length > 1 ? `≈ ${reporting}` : reporting;
}

export function SettleUpPersonScreen({
  personKey,
  onBack,
  onOpenSettings,
}: SettleUpPersonScreenProps) {
  const themeColors = useThemeColors();
  const { settings, getReceiptSplitForTransaction, settleUpWithPerson } = useApp();

  const [shareVisible, setShareVisible] = useState(false);
  const [settleVisible, setSettleVisible] = useState(false);

  const summary = useSettleUpSummary();

  const person = useMemo(
    () => summary.people.find((p) => p.key === personKey) ?? null,
    [summary.people, personKey],
  );
  const locale = settings.locale ?? I18n.locale ?? 'en';
  const state = person ? personBalanceState(person) : 'settled';

  // Blank while the person is missing (the last share was removed) so the header
  // doesn't flash a fallback name for the one frame before the screen pops.
  const title = person ? (person.name ?? `${I18n.t('transactions.settleUp.someone')}`) : '';

  // What is open, by which way it is owed, then everything already settled.
  const sections = useMemo<SettleUpShareSection<PersonDebtBill>[]>(() => {
    if (!person) return [];
    const { owed, settled } = buildSettleUpShareCards(person.bills);
    const owesYou = owed.filter((card) => card.share.direction === 'owes_you');
    const youOwe = owed.filter((card) => card.share.direction === 'you_owe');
    const result: SettleUpShareSection<PersonDebtBill>[] = [];
    if (owesYou.length > 0) {
      result.push({
        key: 'owes_you',
        header: (
          <SettleUpSectionHeader
            title={I18n.t('transactions.settleUp.section_owes_you', { name: title })}
          />
        ),
        cards: owesYou,
      });
    }
    if (youOwe.length > 0) {
      result.push({
        key: 'you_owe',
        header: (
          <SettleUpSectionHeader
            title={I18n.t('transactions.settleUp.section_you_owe', { name: title })}
          />
        ),
        cards: youOwe,
      });
    }
    if (settled.length > 0) {
      result.push({
        key: 'settled',
        header: <SettleUpSectionHeader title={I18n.t('transactions.settleUp.section_paid')} />,
        cards: settled,
      });
    }
    return result;
  }, [person, title]);

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

  // How the net came about, shown only when shares go both ways.
  const breakdown =
    person && person.totalReporting > 0 && person.owedReporting > 0
      ? I18n.t('transactions.settleUp.net_breakdown', {
          name: title,
          owes: formatReporting(person.totalReporting),
          owe: formatReporting(person.owedReporting),
        })
      : null;

  const settleContent = useMemo<SettleUpConfirmContent | null>(() => {
    if (!person || !settleVisible) return null;
    return {
      title: I18n.t('transactions.settleUp.settle_with', { name: title }),
      caption:
        state === 'owes_you'
          ? I18n.t('transactions.settleUp.person_pays_you', { name: title })
          : state === 'you_owe'
            ? I18n.t('transactions.settleUp.you_pay_person', { name: title })
            : I18n.t('transactions.settleUp.even_caption'),
      amountText: netAmountText(person, formatNative, formatReporting),
      flow: state === 'owes_you' ? 'receive' : state === 'you_owe' ? 'pay' : 'even',
      detail: breakdown,
      confirmLabel: I18n.t('transactions.settleUp.settle_up'),
    };
  }, [person, settleVisible, title, state, formatNative, formatReporting, breakdown]);

  // Receipt: title is the person's name, one line per bill with its date. A
  // bill saved through Split by Item lists the person's items as bullets, and
  // a bill they paid is taken off, so the total is what they owe on balance.
  const receiptContent = useMemo<ReceiptContent | null>(() => {
    if (!person) return null;
    const unpaid = person.bills.filter((bill) => !bill.paidAt);
    return {
      title,
      subtitle: null,
      totalLabel: I18n.t('transactions.settleUp.receipt_total_label'),
      totalText:
        person.netByCurrency
          .map((c) => `${c.amount < 0 ? '−' : ''}${formatNative(Math.abs(c.amount), c.currency)}`)
          .join(' + ') || formatReporting(0),
      lines: unpaid.map((bill): ReceiptLine => {
        const youOwe = bill.direction === 'you_owe';
        const record = youOwe ? null : getReceiptSplitForTransaction(bill.transactionId);
        const amount = formatNative(bill.amount, bill.currency);
        return {
          key: bill.splitId,
          categoryIcon: bill.categoryIcon,
          label:
            bill.note?.trim() || bill.categoryName || I18n.t('transactions.settleUp.untitled_bill'),
          sublabel: youOwe
            ? `${formatShortDate(bill.date)} · ${I18n.t('transactions.settleUp.person_paid', { name: title })}`
            : formatShortDate(bill.date),
          bullets: [
            ...(record ? (personItemNames(record, person.name) ?? []) : []),
            ...partPaidBullet(bill, formatNative),
          ],
          amount: youOwe ? `−${amount}` : amount,
        };
      }),
    };
  }, [person, title, formatNative, formatReporting, getReceiptSplitForTransaction]);

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={title} />
      {person ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          >
            <View className="items-center px-4 pt-1 pb-2">
              <View
                className="h-16 w-16 items-center justify-center rounded-full"
                style={{
                  backgroundColor: avatarColor(person.key),
                  opacity: state === 'settled' ? 0.55 : 1,
                }}
              >
                <Text variant="subheading" style={{ color: '#fff' }}>
                  {personInitial(person.name)}
                </Text>
              </View>
              <Text variant="caption" tone="muted" className="mt-3 text-center">
                {state === 'owes_you'
                  ? I18n.t('transactions.settleUp.section_owes_you', { name: title })
                  : state === 'you_owe'
                    ? I18n.t('transactions.settleUp.section_you_owe', { name: title })
                    : state === 'even'
                      ? I18n.t('transactions.settleUp.even_caption')
                      : I18n.t('transactions.settleUp.settled_up')}
              </Text>
              {state === 'settled' ? null : (
                <Text
                  variant="title"
                  className={cn(
                    'text-center',
                    state === 'owes_you'
                      ? 'text-success'
                      : state === 'you_owe'
                        ? 'text-destructive'
                        : '',
                  )}
                >
                  {netAmountText(person, formatNative, formatReporting)}
                </Text>
              )}
              {breakdown ? (
                <Text variant="caption" tone="muted" className="mt-1 text-center">
                  {breakdown}
                </Text>
              ) : null}
            </View>

            <SettleUpShareList
              sections={sections}
              locale={locale}
              renderLeading={(bill) => (
                <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
              )}
              label={(bill) =>
                bill.note?.trim() ||
                bill.categoryName ||
                I18n.t('transactions.settleUp.untitled_bill')
              }
              caption={(bill) => formatShortDate(bill.date)}
              tagYouOwe={false}
            />
          </ScrollView>

          {person.unpaidBillCount > 0 ? (
            <View className="flex-row items-center gap-3 px-5 pb-8 pt-2">
              <Button
                onPress={() => {
                  void triggerHaptic('selection');
                  setSettleVisible(true);
                }}
                className="flex-1"
              >
                <Text>{I18n.t('transactions.settleUp.settle_up')}</Text>
              </Button>
              {/* Asking for the money only makes sense while they owe on balance. */}
              {state === 'owes_you' ? (
                <Pressable
                  onPress={handleShare}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.settleUp.share_receipt')}
                  className="h-12 w-12 items-center justify-center rounded-full border border-border/30 bg-secondary/60 active:opacity-70"
                >
                  <Send size={18} color={themeColors.text} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <SplitReceiptShareModal
            visible={shareVisible}
            onClose={() => setShareVisible(false)}
            content={receiptContent}
            itemCount={person.unpaidBillCount}
            onSetupQr={onOpenSettings}
          />

          <SettleUpConfirmSheet
            content={settleContent}
            onClose={() => setSettleVisible(false)}
            onConfirm={(accountId) => {
              setSettleVisible(false);
              settleUpWithPerson(person.key, accountId);
            }}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
