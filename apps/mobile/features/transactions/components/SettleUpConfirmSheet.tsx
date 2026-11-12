import { ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo, AccountPickerSheet, Button, Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp } from '~/context/AppContext';
import {
  type SettleUpFlow,
  SettleUpFlowAvatars,
} from '~/features/transactions/components/SettleUpFlowAvatars';
import { pickPaybackAccountId } from '~/features/transactions/lib/entryDefaults';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

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
  /** A muted line under the amount (how a net came about, or the bill); null to omit. */
  detail?: string | null;
  confirmLabel: string;
}

interface SettleUpConfirmSheetProps {
  content: SettleUpConfirmContent | null;
  onClose: () => void;
  /** The account the money arrived in or left from; null when the user has none. */
  onConfirm: (accountId: string | null) => void;
}

/**
 * The one confirmation both Balances settlements share: Settle up with a
 * person (everything open, both ways) and paying a friend back for one bill.
 * It shows who pays whom as two avatars and an arrow, then the amount, which
 * is fixed, so all it asks is which account the money moved through.
 */
export function SettleUpConfirmSheet({ content, onClose, onConfirm }: SettleUpConfirmSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();
  const { accounts, accountGroups, getAccountById, settings } = useApp();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The sheet keeps what it showed while it slides away, instead of emptying
  // the moment the caller clears its content.
  const lastContent = useRef<SettleUpConfirmContent | null>(null);
  if (content) lastContent.current = content;
  const shown = content ?? lastContent.current;

  // Seeded when the sheet opens, not on every account change while it is open:
  // the account money is paid to by default, which is never an archived one.
  const openingAccountId = useRef<() => string | null>(() => null);
  openingAccountId.current = () => pickPaybackAccountId(accounts, settings.defaultPaybackAccountId);
  const open = content !== null;
  useEffect(() => {
    if (!open) return;
    setAccountId(openingAccountId.current());
    setPickerOpen(false);
  }, [open]);

  const account = accountId ? getAccountById(accountId) : null;
  const hasAccounts = accounts.length > 0;

  return (
    <ThemeModal
      visible={open}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable accessible={false} className="absolute inset-0 bg-black/40" onPress={onClose} />
        <View
          className="overflow-hidden rounded-t-[28px] bg-background"
          style={[sheetColumnStyle, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          {shown ? (
            <>
              <View className="items-center pt-2.5">
                <View className="h-1 w-10 rounded-full bg-border/60" />
              </View>
              <View className="items-center px-6 pt-6">
                <SettleUpFlowAvatars
                  personKey={shown.personKey}
                  personName={shown.personName}
                  flow={shown.flow}
                />
                <Text variant="caption" tone="muted" numberOfLines={1} className="mt-3">
                  {shown.caption}
                </Text>
                <Text
                  variant="display"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={cn(
                    'mt-0.5 text-center',
                    shown.flow === 'receive'
                      ? 'text-success'
                      : shown.flow === 'pay'
                        ? 'text-destructive'
                        : '',
                  )}
                >
                  {shown.amountText}
                </Text>
                {shown.detail ? (
                  <Text
                    variant="caption"
                    tone="muted"
                    numberOfLines={2}
                    className="mt-1 text-center"
                  >
                    {shown.detail}
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
                      shown.flow === 'pay'
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

              <View className="px-4 pt-4">
                <Button
                  onPress={() => {
                    void triggerHaptic('success');
                    onConfirm(hasAccounts ? accountId : null);
                  }}
                  className="w-full"
                >
                  <Text>{shown.confirmLabel}</Text>
                </Button>
              </View>
            </>
          ) : null}
        </View>

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
      </View>
    </ThemeModal>
  );
}
