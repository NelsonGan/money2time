import { Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AccountLogo, AccountPickerSheet, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  SplitPaymentSheet,
  type SplitPaymentTarget,
} from '~/features/transactions/components/SplitPaymentSheet';
import type { SettleUpShareCard } from '~/features/transactions/lib/settleUpDateGroups';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatDayHeaderParts } from '~/utils/dayHeader';
import { dayKeyFromIsoLocal, formatCurrency } from '~/utils/formatters';

/** One person's share of one bill, as both settle-up detail screens list it. */
interface SettleUpShare {
  splitId: string;
  paidAt: string | null;
  paybackAccountId: string | null;
  amount: number;
  currency: string;
  /** The whole share and what is paid of it (a share paid in parts). */
  shareTotal: number;
  sharePaid: number;
  shareKey: string;
}

/** A run of cards under one heading (a date, or Still owed / Paid back). */
export interface SettleUpShareSection<T> {
  key: string;
  header: ReactNode;
  cards: SettleUpShareCard<T>[];
}

interface SettleUpShareListProps<T extends SettleUpShare> {
  sections: SettleUpShareSection<T>[];
  locale: string;
  /** The 40pt disc at the start of a card (a category icon, or a person's initial). */
  renderLeading: (share: T) => ReactNode;
  label: (share: T) => string;
}

/** "Paid RM300 of RM1,000" under a receipt line whose share is paid in parts. */
export function partPaidBullet(
  share: { sharePaid: number; shareTotal: number; currency: string; paidAt: string | null },
  formatNative: (amount: number, currency: string) => string,
): string[] {
  if (share.paidAt || !(share.sharePaid > 0)) return [];
  return [
    I18n.t('transactions.settleUp.receipt_paid_so_far', {
      paid: formatNative(share.sharePaid, share.currency),
      total: formatNative(share.shareTotal, share.currency),
    }),
  ];
}

/** The section heading on the bill page ("Still owed", "Paid back"). */
export function SettleUpSectionHeader({ title }: { title: string }) {
  return (
    <Text variant="label" tone="muted" className="pt-3 pb-1">
      {title}
    </Text>
  );
}

/**
 * The share cards on the Settle Up person and bill pages, one card per share
 * with its payments in it. A share still owed carries its payback account
 * (opens the account picker), its payments under a progress bar, Remove, and
 * Mark paid, which opens `SplitPaymentSheet` on the full amount (less records
 * a part payment). A share paid back in full is a compact muted card; one
 * paid in parts opens to list them.
 */
export function SettleUpShareList<T extends SettleUpShare>({
  sections,
  locale,
  renderLeading,
  label,
}: SettleUpShareListProps<T>) {
  const themeColors = useThemeColors();
  const {
    accounts,
    accountGroups,
    getAccountById,
    recordSplitPayment,
    updateSplitPaybackAccount,
    deleteSplit,
  } = useApp();
  const [pickerShare, setPickerShare] = useState<T | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<SplitPaymentTarget | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const handleRecordPayment = useCallback(
    (amount: number, paybackAccountId: string | null) => {
      if (!paymentTarget) return;
      recordSplitPayment(paymentTarget.splitId, amount, { paybackAccountId });
      setPaymentTarget(null);
    },
    [paymentTarget, recordSplitPayment],
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

  const toggleExpanded = useCallback((key: string) => {
    void triggerHaptic('selection');
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const dayLabel = useCallback(
    (iso: string) => formatDayHeaderParts(dayKeyFromIsoLocal(iso), locale).dateLabel,
    [locale],
  );

  const renderPayments = (payments: T[]) => (
    <View className="mt-1.5">
      {payments.map((payment, index) => (
        <View
          key={payment.splitId}
          className={
            index > 0
              ? 'flex-row items-center gap-2 border-t border-border/15 py-1.5'
              : 'flex-row items-center gap-2 py-1.5'
          }
        >
          <Check size={13} color={themeColors.success} />
          <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
            {payment.paidAt ? dayLabel(payment.paidAt) : ''}
          </Text>
          <Text variant="caption" tone="muted">
            {formatCurrency(payment.amount, currencySymbolForCode(payment.currency))}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderOwedCard = ({ share, payments }: SettleUpShareCard<T>) => {
    const account = share.paybackAccountId ? getAccountById(share.paybackAccountId) : null;
    const symbol = currencySymbolForCode(share.currency);
    const paidRatio =
      share.sharePaid > 0 && share.shareTotal > 0
        ? Math.min(1, share.sharePaid / share.shareTotal)
        : null;
    return (
      <View
        key={share.splitId}
        className="rounded-2xl border border-border/25 bg-card/60 px-4 pt-3.5 pb-2.5"
      >
        <View className="flex-row items-start gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
            {renderLeading(share)}
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {label(share)}
            </Text>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerShare(share);
              }}
              accessibilityRole="button"
              className="mt-1 max-w-full flex-row items-center gap-1.5 self-start rounded-full bg-secondary/50 py-1 pl-2 pr-2.5 active:opacity-70"
            >
              {account ? (
                <AccountLogo
                  logoId={account.logoId}
                  type={account.type}
                  goalEmoji={account.goalEmoji}
                  size={16}
                />
              ) : null}
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-shrink">
                {account?.name ?? I18n.t('common.no_account')}
              </Text>
              <ChevronDown size={12} color={themeColors.textMuted} />
            </Pressable>
          </View>
          <View className="items-end">
            <Text variant="bodyStrong">{formatCurrency(share.amount, symbol)}</Text>
            {paidRatio !== null ? (
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.share_of_total', {
                  total: formatCurrency(share.shareTotal, symbol),
                })}
              </Text>
            ) : null}
          </View>
        </View>

        {paidRatio !== null ? (
          <View className="mt-3 pl-[52px]">
            <View
              className="h-1.5 overflow-hidden rounded-full bg-secondary/60"
              accessibilityLabel={I18n.t('transactions.settleUp.share_paid', {
                paid: formatCurrency(share.sharePaid, symbol),
              })}
            >
              <View
                className="h-full rounded-full bg-success"
                style={{ width: `${Math.max(4, paidRatio * 100)}%` }}
              />
            </View>
            {renderPayments(payments)}
          </View>
        ) : null}

        <View
          className={
            payments.length > 0
              ? 'mt-2 flex-row items-center border-t border-border/15 pt-2'
              : 'mt-2 flex-row items-center'
          }
        >
          <Pressable
            onPress={() => handleDelete(share.splitId)}
            hitSlop={8}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 py-1.5 pr-2 active:opacity-60"
          >
            <Trash2 size={14} color={themeColors.textMuted} />
            <Text variant="caption" tone="muted">
              {I18n.t('common.remove')}
            </Text>
          </Pressable>
          <View className="flex-1" />
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setPaymentTarget({
                splitId: share.splitId,
                label: label(share),
                owed: share.amount,
                shareTotal: share.shareTotal,
                currency: share.currency,
                paybackAccountId: share.paybackAccountId,
              });
            }}
            hitSlop={8}
            accessibilityRole="button"
            className="flex-row items-center gap-1 rounded-full bg-success/15 px-3.5 py-2 active:opacity-70"
          >
            <Check size={14} color={themeColors.success} />
            <Text variant="caption" className="font-medium text-success">
              {I18n.t('transactions.editor.split.mark_paid')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSettledCard = ({ share, payments }: SettleUpShareCard<T>) => {
    const inParts = payments.length > 1;
    const open = inParts && expanded.has(share.shareKey);
    const lastPaid = share.paidAt ? dayLabel(share.paidAt) : '';
    const Chevron = open ? ChevronUp : ChevronDown;
    return (
      <Pressable
        key={share.splitId}
        disabled={!inParts}
        onPress={() => toggleExpanded(share.shareKey)}
        accessibilityRole={inParts ? 'button' : undefined}
        accessibilityState={inParts ? { expanded: open } : undefined}
        className="rounded-2xl border border-border/15 bg-secondary/20 px-4 py-3 active:opacity-80"
      >
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
            {renderLeading(share)}
            <View className="absolute -bottom-1 -right-1 h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-success">
              <Check size={8} strokeWidth={3.5} color={themeColors.background} />
            </View>
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {label(share)}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {inParts
                ? I18n.t('transactions.settleUp.paid_in_payments', {
                    count: payments.length,
                    date: lastPaid,
                  })
                : I18n.t('transactions.settleUp.paid_on', { date: lastPaid })}
            </Text>
          </View>
          <Text variant="bodyStrong" tone="muted">
            {formatCurrency(share.shareTotal, currencySymbolForCode(share.currency))}
          </Text>
          {inParts ? <Chevron size={14} color={themeColors.textMuted} /> : null}
        </View>
        {open ? <View className="pl-[52px]">{renderPayments(payments)}</View> : null}
      </Pressable>
    );
  };

  return (
    <>
      <View className="mt-4 gap-3">
        {sections.map((section) => (
          <View key={section.key} className="gap-2">
            {section.header}
            {section.cards.map((card) =>
              card.share.paidAt ? renderSettledCard(card) : renderOwedCard(card),
            )}
          </View>
        ))}
      </View>

      <AccountPickerSheet
        visible={pickerShare !== null}
        onClose={() => setPickerShare(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={pickerShare?.paybackAccountId ?? null}
        onSelect={(accountId) => {
          if (pickerShare) updateSplitPaybackAccount(pickerShare.splitId, accountId);
          setPickerShare(null);
        }}
      />

      <SplitPaymentSheet
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onRecord={handleRecordPayment}
      />
    </>
  );
}
