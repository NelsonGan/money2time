import { Check, Send } from 'lucide-react-native';
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
} from '~/features/transactions/components/SettleUpShareList';
import type {
  ReceiptContent,
  ReceiptLine,
} from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { avatarColor, personInitial } from '~/features/transactions/lib/personAvatar';
import { personItemNames } from '~/features/transactions/lib/receiptSplitShare';
import { personBalanceState, planPartSettlement } from '~/features/transactions/lib/settleUp';
import {
  buildSettleUpShareCards,
  type SettleUpShareCard,
} from '~/features/transactions/lib/settleUpDateGroups';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PersonDebt, PersonDebtBill } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate, normalizeMoneyAmount } from '~/utils/formatters';

interface SettleUpPersonScreenProps {
  personKey: string;
  /** Only this album's bills with the person (opened from the album's Balances). */
  albumId?: string;
  onBack: () => void;
  onOpenSettings: () => void;
  /** Open one bill, where its shares are marked paid, undone or removed. */
  onOpenTransaction: (transactionId: string) => void;
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

/**
 * One person's balance: the net between the user and them, then the bills
 * that make it up as a plain ledger, green for what they owe and red for what
 * the user owes. A row opens its bill; Settle up clears everything at once.
 */
export function SettleUpPersonScreen({
  personKey,
  albumId,
  onBack,
  onOpenSettings,
  onOpenTransaction,
}: SettleUpPersonScreenProps) {
  const themeColors = useThemeColors();
  const {
    settings,
    albums,
    getReceiptSplitForTransaction,
    settleUpWithPerson,
    recordSplitPayment,
    recordPayBack,
  } = useApp();

  const [shareVisible, setShareVisible] = useState(false);
  const [settleVisible, setSettleVisible] = useState(false);

  const summary = useSettleUpSummary(albumId);

  const person = useMemo(
    () => summary.people.find((p) => p.key === personKey) ?? null,
    [summary.people, personKey],
  );
  const state = person ? personBalanceState(person) : 'settled';
  const albumName = albumId ? albums.find((album) => album.id === albumId)?.name : null;

  // Blank while the person is missing (the last share was removed) so the header
  // doesn't flash a fallback name for the one frame before the screen pops.
  const title = person ? (person.name ?? `${I18n.t('transactions.settleUp.someone')}`) : '';

  // One row per share: what is still open, then what is paid back.
  const { owed, settled } = useMemo(
    () => (person ? buildSettleUpShareCards(person.bills) : { owed: [], settled: [] }),
    [person],
  );

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

  const settleContent = useMemo<SettleUpConfirmContent | null>(() => {
    if (!person || !settleVisible) return null;
    // Who pays, as the amount below says it: the net in the one currency the
    // bills share, else the reporting net (`planPartSettlement` reads it so).
    const single = person.netByCurrency.length === 1 ? person.netByCurrency[0]!.amount : null;
    const flow =
      state === 'even' ? 'even' : (single ?? person.netReporting) >= 0 ? 'receive' : 'pay';
    return {
      personKey: person.key,
      personName: person.name,
      flow,
      caption:
        flow === 'receive'
          ? I18n.t('transactions.settleUp.person_pays_you', { name: title })
          : flow === 'pay'
            ? I18n.t('transactions.settleUp.you_pay_person', { name: title })
            : I18n.t('transactions.settleUp.even_caption'),
      amountText: netAmountText(person, formatNative, formatReporting),
      // Less of it can be paid, in the currency the net is shown in.
      partial:
        state === 'even'
          ? undefined
          : person.netByCurrency.length === 1
            ? {
                full: Math.abs(person.netByCurrency[0]!.amount),
                prefix: currencySymbolForCode(person.netByCurrency[0]!.currency),
              }
            : {
                full: Math.abs(person.netReporting),
                prefix: `${person.netByCurrency.length > 1 ? '≈ ' : ''}${settings.currencySymbol}`,
              },
      // How the net came about, only when shares go both ways.
      detail:
        person.totalReporting > 0 && person.owedReporting > 0
          ? I18n.t('transactions.settleUp.net_breakdown', {
              name: title,
              owes: formatReporting(person.totalReporting),
              owe: formatReporting(person.owedReporting),
            })
          : null,
      confirmLabel: I18n.t('transactions.settleUp.settle_up'),
    };
  }, [person, settleVisible, title, state, formatNative, formatReporting, settings.currencySymbol]);

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

  const renderRow = (
    { share, payments }: SettleUpShareCard<PersonDebtBill>,
    index: number,
    paid: boolean,
  ) => {
    const youOwe = share.direction === 'you_owe';
    const whoPaid = youOwe
      ? I18n.t('transactions.settleUp.person_paid', { name: title })
      : I18n.t('transactions.settleUp.you_paid');
    // A share paid back shows what was paid; one still open, what is left.
    const amount = paid
      ? normalizeMoneyAmount(payments.reduce((sum, payment) => sum + payment.amount, 0))
      : share.amount;
    const caption = paid
      ? I18n.t(youOwe ? 'transactions.settleUp.you_paid_on' : 'transactions.settleUp.paid_on', {
          date: share.paidAt ? formatShortDate(share.paidAt) : '',
        })
      : `${formatShortDate(share.date)} · ${whoPaid}`;
    // A share partly paid shows how far along it is as a slim bar under the
    // line, read out in words: the line itself has no room for the figures.
    const partPaid = !paid && share.sharePaid > 0 && share.shareTotal > 0;
    const partPaidLabel = partPaid
      ? I18n.t('transactions.settleUp.share_paid', {
          paid: formatNative(share.sharePaid, share.currency),
        })
      : null;
    return (
      <Pressable
        key={share.splitId}
        onPress={() => {
          void triggerHaptic('selection');
          onOpenTransaction(share.transactionId);
        }}
        accessibilityRole="button"
        className={cn(
          'flex-row items-center gap-3 px-4 py-3 active:opacity-70',
          index > 0 ? 'border-t border-border/15' : '',
        )}
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
          <CategoryEmoji icon={share.categoryIcon} size={22} className="text-[19px]" />
          {paid ? (
            <View className="absolute -bottom-1 -right-1 h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-success">
              <Check size={8} strokeWidth={3.5} color={themeColors.background} />
            </View>
          ) : null}
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" tone={paid ? 'muted' : undefined} numberOfLines={1}>
            {share.note?.trim() ||
              share.categoryName ||
              I18n.t('transactions.settleUp.untitled_bill')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
          {partPaid ? (
            <View
              accessible
              accessibilityLabel={partPaidLabel ?? undefined}
              className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-border/40"
            >
              <View
                className="h-full rounded-full bg-success"
                style={{
                  width: `${Math.min(100, Math.round((share.sharePaid / share.shareTotal) * 100))}%`,
                }}
              />
            </View>
          ) : null}
        </View>
        <Text
          variant="bodyStrong"
          className={paid ? 'text-muted-foreground' : youOwe ? 'text-destructive' : 'text-success'}
        >
          {paid ? '' : youOwe ? '−' : '+'}
          {formatNative(amount, share.currency)}
        </Text>
      </Pressable>
    );
  };

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
              {/* Opened from an album: these are that album's bills alone. */}
              {albumName ? (
                <View className="mt-2.5 rounded-full bg-secondary/60 px-3 py-0.5">
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {albumName}
                  </Text>
                </View>
              ) : null}
              <Text variant="caption" tone="muted" className="mt-3 text-center">
                {I18n.t(
                  state === 'owes_you'
                    ? 'transactions.settleUp.person_owes_label'
                    : state === 'you_owe'
                      ? 'transactions.settleUp.you_owe_tag'
                      : state === 'even'
                        ? 'transactions.settleUp.hero_even'
                        : 'transactions.settleUp.settled_up',
                )}
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
            </View>

            {owed.length > 0 ? (
              <View className="mt-4 overflow-hidden rounded-2xl border border-border/25 bg-card/60">
                {owed.map((card, index) => renderRow(card, index, false))}
              </View>
            ) : null}

            {settled.length > 0 ? (
              <View className="mt-3">
                <SettleUpSectionHeader title={I18n.t('transactions.settleUp.section_paid')} />
                <View className="mt-1 overflow-hidden rounded-2xl border border-border/15 bg-secondary/20">
                  {settled.map((card, index) => renderRow(card, index, true))}
                </View>
              </View>
            ) : null}
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
            onConfirm={(accountId, amount) => {
              setSettleVisible(false);
              if (amount === null) {
                settleUpWithPerson(person.key, accountId, albumId);
                return;
              }
              // A part of it: onto the oldest open bills of whoever pays.
              for (const payment of planPartSettlement(person, amount)) {
                if (payment.direction === 'owes_you') {
                  recordSplitPayment(payment.splitId, payment.amount, {
                    paybackAccountId: accountId,
                  });
                } else {
                  recordPayBack(payment.splitId, payment.amount, { accountId });
                }
              }
            }}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
