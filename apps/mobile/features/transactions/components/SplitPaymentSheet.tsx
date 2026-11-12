import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccountLogo, AccountPickerSheet, Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { useApp } from '~/context/AppContext';
import {
  evaluateExpression,
  sanitizeInitialAmount,
} from '~/features/transactions/components/editor/calculatorEngine';
import { MiniNumpad } from '~/features/transactions/components/editor/MiniNumpad';
import { pickPaybackAccountId } from '~/features/transactions/lib/entryDefaults';
import { planSplitPayment } from '~/features/transactions/lib/splitPayments';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { isAccountArchived } from '~/utils/accountArchive';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, normalizeMoneyAmount } from '~/utils/formatters';

/** The unpaid row of a share that a payment is recorded against. */
export interface SplitPaymentTarget {
  splitId: string;
  /** Who paid, or which bill (the row's label on the page it opened from). */
  label: string;
  /** Still owed on this row. */
  owed: number;
  /** The whole share, paid parts included. */
  shareTotal: number;
  currency: string;
  paybackAccountId: string | null;
  /** False for a bill paid from no account: the payback lands nowhere, so no Paid to. */
  billHasAccount?: boolean;
  /**
   * `pay` when it is the user paying a friend back for a bill that friend
   * paid, so the account is where the money left from. A friend paying the
   * user back by default.
   */
  direction?: 'receive' | 'pay';
}

interface SplitPaymentSheetProps {
  target: SplitPaymentTarget | null;
  onClose: () => void;
  onRecord: (amount: number, paybackAccountId: string | null) => void;
}

/**
 * Balances' Mark paid: how much was paid back and through which account. It
 * opens on everything still owed, which settles the share; lowering the
 * amount records a part payment instead. The same sheet serves a friend
 * paying the user back and the user paying a friend back (`direction`).
 */
export function SplitPaymentSheet({ target, onClose, onRecord }: SplitPaymentSheetProps) {
  const themeColors = useThemeColors();
  const { accounts, accountGroups, getAccountById, settings } = useApp();

  const [expression, setExpression] = useState('');
  // Remounts the pad each time the sheet opens, so it starts on what is owed.
  const [padKey, setPadKey] = useState(0);
  const [paybackAccountId, setPaybackAccountId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Where the sheet opens paid to: the share's own account, unless the user has
  // archived it since, then where money is paid to now, so a payback never
  // lands in an account they put away. A ref, so the sheet re-seeds only when
  // it opens, not on every account change while it is open.
  const openingPaybackAccountId = useRef<(saved: string | null) => string | null>(() => null);
  openingPaybackAccountId.current = (saved) => {
    const account = saved ? getAccountById(saved) : null;
    return account && isAccountArchived(account)
      ? pickPaybackAccountId(accounts, settings.defaultPaybackAccountId)
      : saved;
  };

  useEffect(() => {
    if (!target) return;
    // Seeded exactly as the pad seeds itself ("30.00"), so the amount shown is
    // the one Delete edits; showing "30" over a pad holding "30.00" made the
    // first two Deletes look like they did nothing.
    setExpression(sanitizeInitialAmount(String(normalizeMoneyAmount(target.owed))));
    setPadKey((key) => key + 1);
    setPaybackAccountId(openingPaybackAccountId.current(target.paybackAccountId));
    setPickerOpen(false);
  }, [target]);

  const amount = useMemo(() => evaluateExpression(expression), [expression]);
  const plan = target ? planSplitPayment(target.owed, amount) : null;
  const tooMuch = !!target && amount > target.owed + 0.005;

  const format = useCallback(
    (value: number) => formatCurrency(value, currencySymbolForCode(target?.currency ?? '')),
    [target?.currency],
  );

  const handleRecord = useCallback(() => {
    if (!target || !plan) {
      void triggerHaptic('warning');
      return;
    }
    void triggerHaptic('success');
    onRecord(plan.amount, target.billHasAccount === false ? null : paybackAccountId);
  }, [onRecord, paybackAccountId, plan, target]);

  const account = paybackAccountId ? getAccountById(paybackAccountId) : null;

  return (
    <BottomSheetModal
      visible={target !== null}
      onClose={onClose}
      overlay={
        <AccountPickerSheet
          overlay
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          accounts={accounts}
          accountGroups={accountGroups}
          selectedAccountId={paybackAccountId}
          onSelect={(accountId) => {
            setPaybackAccountId(accountId);
            setPickerOpen(false);
          }}
        />
      }
    >
      {target ? (
        <>
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border/60" />
          </View>
          <View className="items-center px-6 pt-4">
            <Text variant="subheading">{I18n.t('transactions.editor.split.mark_paid')}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
              {target.label}
            </Text>
            <View className="mt-4 flex-row items-baseline gap-1">
              <Text variant="subheading" tone="muted">
                {currencySymbolForCode(target.currency)}
              </Text>
              <Text
                variant="display"
                tone={tooMuch ? 'error' : 'default'}
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityLabel={I18n.t('transactions.settleUp.payment_amount')}
              >
                {expression || '0'}
              </Text>
            </View>
            <Text variant="caption" tone={tooMuch ? 'error' : 'muted'} className="mt-1">
              {tooMuch
                ? I18n.t('transactions.settleUp.payment_too_much', {
                    owed: format(target.owed),
                  })
                : I18n.t('transactions.settleUp.payment_left_of', {
                    left: format(Math.max(0, normalizeMoneyAmount(target.owed - amount))),
                    total: format(target.shareTotal),
                  })}
            </Text>
          </View>

          {target.billHasAccount === false ? (
            <View className="mb-3" />
          ) : (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerOpen(true);
              }}
              accessibilityRole="button"
              className="mx-4 mt-4 mb-3 flex-row items-center gap-2 rounded-2xl border border-border/25 bg-card/60 px-4 py-3 active:opacity-70"
            >
              <Text variant="body" tone="muted" className="flex-1">
                {I18n.t(
                  target.direction === 'pay'
                    ? 'transactions.settleUp.paid_from'
                    : 'transactions.settleUp.payment_paid_to',
                )}
              </Text>
              {account ? (
                <AccountLogo
                  logoId={account.logoId}
                  type={account.type}
                  goalEmoji={account.goalEmoji}
                  size={18}
                />
              ) : null}
              <Text variant="bodyStrong" numberOfLines={1} className="max-w-[55%]">
                {account?.name ?? I18n.t('common.no_account')}
              </Text>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          )}

          <MiniNumpad
            key={padKey}
            initialExpression={expression}
            onValueChange={setExpression}
            onConfirm={handleRecord}
            confirmLabel={
              plan?.kind === 'partial'
                ? I18n.t('transactions.settleUp.part_paid')
                : I18n.t('transactions.editor.split.mark_paid')
            }
          />
        </>
      ) : null}
    </BottomSheetModal>
  );
}
