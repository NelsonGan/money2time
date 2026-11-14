import { ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo, AccountPickerSheet, Button, Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { useApp } from '~/context/AppContext';
import {
  evaluateExpression,
  sanitizeInitialAmount,
} from '~/features/transactions/components/editor/calculatorEngine';
import { MiniNumpad } from '~/features/transactions/components/editor/MiniNumpad';
import {
  type SettleUpFlow,
  SettleUpFlowAvatars,
} from '~/features/transactions/components/SettleUpFlowAvatars';
import { pickPaybackAccountId } from '~/features/transactions/lib/entryDefaults';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatCurrency, normalizeMoneyAmount } from '~/utils/formatters';

/** What a settlement is about to record, already worded and formatted. */
export interface SettleUpConfirmContent {
  /** The other person: their avatar's colour and initial. */
  personKey: string;
  personName: string | null;
  flow: SettleUpFlow;
  /** Who pays whom, in a line ("Aisha pays you"). */
  caption: string;
  /** The amount that changes hands. */
  amountText: string;
  /**
   * That amount as a number, when less of it can be paid: the sheet opens
   * with a pad seeded with it, and a smaller one settles part of it. `prefix`
   * is what goes before the number ("RM", "≈ RM").
   */
  partial?: { full: number; prefix: string };
  /** A muted line under the amount (how a net came about, or the bill); null to omit. */
  detail?: string | null;
  confirmLabel: string;
}

interface SettleUpConfirmSheetProps {
  content: SettleUpConfirmContent | null;
  onClose: () => void;
  /**
   * The account the money arrived in or left from (null when the user has
   * none), and how much of it: null for all of it.
   */
  onConfirm: (accountId: string | null, amount: number | null) => void;
}

/**
 * The confirmation for Settle up with a person: everything open between the
 * two, both ways, in one payment. It shows who pays whom as two avatars and an
 * arrow, then the amount, and asks which account the money moved through.
 * When less of it can be paid, the pad is open from the start, seeded with all
 * of it: the first digit typed replaces it. (Paying one bill back uses
 * SplitPaymentSheet.)
 */
export function SettleUpConfirmSheet({ content, onClose, onConfirm }: SettleUpConfirmSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { accounts, accountGroups, getAccountById, settings } = useApp();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The amount as typed on the pad; null while the sheet has no pad (an
  // amount that is paid whole).
  const [expression, setExpression] = useState<string | null>(null);

  // Seeded when the sheet opens, not on every account change while it is open:
  // the account money is paid to by default, which is never an archived one.
  const openingAccountId = useRef<() => string | null>(() => null);
  openingAccountId.current = () => pickPaybackAccountId(accounts, settings.defaultPaybackAccountId);
  // The pad opens seeded with the whole amount, so a part payment is typed
  // straight away instead of after a tap on the amount.
  const openingExpression = useRef<() => string | null>(() => null);
  openingExpression.current = () =>
    content?.partial
      ? sanitizeInitialAmount(String(normalizeMoneyAmount(content.partial.full)))
      : null;
  const open = content !== null;
  useEffect(() => {
    if (!open) return;
    setAccountId(openingAccountId.current());
    setPickerOpen(false);
    setExpression(openingExpression.current());
  }, [open]);

  const partial = content?.partial ?? null;
  const editing = partial !== null && expression !== null;
  const typed = editing ? evaluateExpression(expression) : 0;
  const tooMuch = editing && typed > partial.full + 0.005;
  const isPart = editing && typed < partial.full - 0.005;
  const format = (value: number) => formatCurrency(value, partial?.prefix ?? '');
  const confirm = () => {
    if (editing && (tooMuch || !(typed > 0))) {
      void triggerHaptic('warning');
      return;
    }
    void triggerHaptic('success');
    onConfirm(hasAccounts ? accountId : null, isPart ? normalizeMoneyAmount(typed) : null);
  };

  const account = accountId ? getAccountById(accountId) : null;
  const hasAccounts = accounts.length > 0;

  return (
    <BottomSheetModal
      visible={open}
      onClose={onClose}
      // The pad brings its own bottom inset.
      style={editing ? null : { paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      overlay={
        <AccountPickerSheet
          overlay
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          accounts={accounts}
          accountGroups={accountGroups}
          selectedAccountId={accountId}
          onSelect={(picked) => {
            setAccountId(picked);
            setPickerOpen(false);
          }}
        />
      }
    >
      {content ? (
        <>
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border/60" />
          </View>
          <View className="items-center px-6 pt-6">
            <SettleUpFlowAvatars
              personKey={content.personKey}
              personName={content.personName}
              flow={content.flow}
            />
            <Text variant="caption" tone="muted" numberOfLines={1} className="mt-3">
              {content.caption}
            </Text>
            <View
              accessible
              accessibilityLabel={I18n.t('transactions.settleUp.payment_amount')}
              testID="settle-up-amount"
              className="mt-0.5 flex-row items-center"
            >
              <Text
                variant="display"
                numberOfLines={1}
                adjustsFontSizeToFit
                className={cn(
                  'text-center',
                  tooMuch || content.flow === 'pay'
                    ? 'text-destructive'
                    : content.flow === 'receive'
                      ? 'text-success'
                      : '',
                )}
              >
                {editing ? `${partial.prefix}${expression || '0'}` : content.amountText}
              </Text>
            </View>
            {/* The whole amount, as it opens, keeps how it came about; a
                different one says what it leaves. */}
            {editing && (tooMuch || isPart) ? (
              <Text variant="caption" tone={tooMuch ? 'error' : 'muted'} className="mt-1">
                {tooMuch
                  ? I18n.t('transactions.settleUp.payment_too_much', {
                      owed: format(partial.full),
                    })
                  : I18n.t('transactions.settleUp.payment_left_of', {
                      left: format(Math.max(0, normalizeMoneyAmount(partial.full - typed))),
                      total: format(partial.full),
                    })}
              </Text>
            ) : content.detail ? (
              <Text variant="caption" tone="muted" numberOfLines={2} className="mt-1 text-center">
                {content.detail}
              </Text>
            ) : null}
          </View>

          {hasAccounts ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerOpen(true);
              }}
              accessibilityRole="button"
              className="mx-4 mt-5 flex-row items-center gap-2 rounded-2xl border border-border/25 bg-card/60 px-4 py-3 active:opacity-70"
            >
              <Text variant="body" tone="muted" className="flex-1">
                {I18n.t(
                  content.flow === 'pay'
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
          ) : null}

          {editing ? (
            <View className="pt-3">
              <MiniNumpad
                initialExpression={expression}
                onValueChange={setExpression}
                onConfirm={confirm}
                confirmLabel={
                  isPart ? I18n.t('transactions.settleUp.part_paid') : content.confirmLabel
                }
              />
            </View>
          ) : (
            <View className="px-4 pt-4">
              <Button onPress={confirm} className="w-full">
                <Text>{content.confirmLabel}</Text>
              </Button>
            </View>
          )}
        </>
      ) : null}
    </BottomSheetModal>
  );
}
