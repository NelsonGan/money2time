import { Check, ChevronDown, Trash2 } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { AccountLogo, AccountPickerSheet, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { SettleUpDateHeader } from '~/features/transactions/components/SettleUpDateHeader';
import {
  SplitPaymentSheet,
  type SplitPaymentTarget,
} from '~/features/transactions/components/SplitPaymentSheet';
import type { SettleUpDateGroup } from '~/features/transactions/lib/settleUpDateGroups';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency } from '~/utils/formatters';

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
  isPartPayment: boolean;
}

interface SettleUpShareListProps<T extends SettleUpShare> {
  groups: SettleUpDateGroup<T>[];
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

/**
 * The date-grouped share cards on the Settle Up person and bill pages. A paid
 * share is a muted row (a part payment says so); an unpaid one carries its
 * payback account (opens the account picker), delete, and Mark paid, which
 * opens `SplitPaymentSheet` on the full amount (less records a part payment),
 * and how much of the share is paid back once part of it is.
 */
export function SettleUpShareList<T extends SettleUpShare>({
  groups,
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

  return (
    <>
      <View className="mt-4 gap-3">
        {groups.map((group, index) => (
          // A day can head both the owed shares and the paid history.
          <View key={`${index}-${group.dayKey}`} className="gap-2">
            <SettleUpDateHeader dayKey={group.dayKey} locale={locale} />
            {group.items.map((share) => {
              const account = share.paybackAccountId
                ? getAccountById(share.paybackAccountId)
                : null;
              const symbol = currencySymbolForCode(share.currency);
              const paidRatio =
                !share.paidAt && share.sharePaid > 0 && share.shareTotal > 0
                  ? Math.min(1, share.sharePaid / share.shareTotal)
                  : null;
              return (
                <View
                  key={share.splitId}
                  className={
                    share.paidAt
                      ? 'rounded-2xl border border-border/15 bg-secondary/20 px-4 py-3.5'
                      : 'rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5'
                  }
                >
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                      {renderLeading(share)}
                    </View>
                    <View className="flex-1">
                      <Text
                        variant="bodyStrong"
                        tone={share.paidAt ? 'muted' : undefined}
                        numberOfLines={1}
                      >
                        {label(share)}
                      </Text>
                      {share.isPartPayment ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {I18n.t('transactions.settleUp.part_payment')}
                        </Text>
                      ) : null}
                      {!share.paidAt ? (
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
                          <Text
                            variant="caption"
                            tone="muted"
                            numberOfLines={1}
                            className="flex-shrink"
                          >
                            {account?.name ?? I18n.t('common.no_account')}
                          </Text>
                          <ChevronDown size={12} color={themeColors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text variant="bodyStrong" tone={share.paidAt ? 'muted' : undefined}>
                        {formatCurrency(share.amount, symbol)}
                      </Text>
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
                    <View className="mt-2.5 pl-[52px]">
                      <View className="h-1.5 overflow-hidden rounded-full bg-secondary/60">
                        <View
                          className="h-full rounded-full bg-success"
                          style={{ width: `${Math.max(4, paidRatio * 100)}%` }}
                        />
                      </View>
                      <Text variant="caption" tone="muted" className="mt-1">
                        {I18n.t('transactions.settleUp.share_paid', {
                          paid: formatCurrency(share.sharePaid, symbol),
                        })}
                      </Text>
                    </View>
                  ) : null}

                  {!share.paidAt ? (
                    <View className="mt-3 flex-row items-center gap-2">
                      <Pressable
                        onPress={() => handleDelete(share.splitId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('common.remove')}
                        className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10 active:opacity-70"
                      >
                        <Trash2 size={15} color={themeColors.error} />
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
