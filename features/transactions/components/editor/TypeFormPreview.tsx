import { CreditCard, Hash } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountLogo, CategoryEmoji, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { Account, TransactionType } from '~/types';
import { cn } from '~/utils';

interface TypeFormPreviewProps {
  type: TransactionType;
  /** Pre-formatted amount, e.g. "RM60.00". Shared across every type. */
  amountText: string;
  amountTone: 'default' | 'error' | 'success';
  /** Work-time nudge under the amount (expense only), matching the live form. */
  nudge?: { before: string; hours: string; after: string } | null;
  account: Account | null;
  fromAccount: Account | null;
  toAccount: Account | null;
  category: { icon: string; name: string } | null;
  note: string;
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="px-4 py-3.5 min-h-[52px] flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
          <Hash size={13} color="#9AA3A0" />
        </View>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function AccountValue({ account }: { account: Account | null }) {
  if (!account) {
    return (
      <Text variant="body" tone="muted">
        {I18n.t('common.no_account')}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      <AccountLogo logoId={account.logoId} type={account.type} size={18} />
      <Text variant="body">{account.name}</Text>
    </View>
  );
}

const DIVIDER = <View className="h-[1px] bg-border/15 mx-4" />;

const styles = StyleSheet.create({
  nudge: {
    fontSize: 11,
  },
});

/**
 * A read-only mirror of the editor form for a given type, shown on the
 * non-active pages of the type pager so the user can peek the next type's
 * layout mid-swipe. The active page renders the real interactive form.
 */
export function TypeFormPreview({
  type,
  amountText,
  amountTone,
  nudge,
  account,
  fromAccount,
  toAccount,
  category,
  note,
}: TypeFormPreviewProps) {
  const themeColors = useThemeColors();
  const isTransfer = type === 'transfer';
  const isBalanceAdjustment = type === 'balance_adjustment';
  const showCategory = type === 'expense' || type === 'income';
  const amountFontSize = amountText.length > 12 ? 14 : amountText.length > 9 ? 18 : 24;

  return (
    // Match the live form's inset (16px side gutters, flush to the top) so a
    // swipe doesn't visibly re-flow when the page becomes active.
    <View className="px-4">
      <View
        className="bg-card/60 border border-border/25 overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        <View className="px-4 py-3.5 min-h-[52px] justify-center">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                <Hash size={13} color={themeColors.textMuted} />
              </View>
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.editor.amount')}
              </Text>
            </View>
            <Text
              variant="heading"
              numberOfLines={1}
              className={cn(
                amountTone === 'error'
                  ? 'text-destructive'
                  : amountTone === 'success'
                    ? 'text-success'
                    : 'text-foreground',
              )}
              style={{ fontSize: amountFontSize }}
            >
              {amountText}
            </Text>
          </View>
          {nudge ? (
            <Text variant="caption" tone="muted" className="text-right mt-0.5" style={styles.nudge}>
              {nudge.before}
              <Text variant="caption" tone="primary" style={styles.nudge}>
                {nudge.hours}
              </Text>
              {nudge.after}
            </Text>
          ) : null}
        </View>

        {DIVIDER}

        {isTransfer ? (
          <>
            <PreviewRow label={I18n.t('transactions.editor.from')}>
              <AccountValue account={fromAccount} />
            </PreviewRow>
            {DIVIDER}
            <PreviewRow label={I18n.t('transactions.editor.to')}>
              <AccountValue account={toAccount} />
            </PreviewRow>
          </>
        ) : (
          <PreviewRow label={I18n.t('transactions.editor.account')}>
            <View className="flex-row items-center gap-2">
              <CreditCard size={16} color={themeColors.textMuted} />
              <AccountValue account={account} />
            </View>
          </PreviewRow>
        )}

        {showCategory ? (
          <>
            {DIVIDER}
            <PreviewRow label={I18n.t('transactions.editor.category')}>
              {category ? (
                <View className="flex-row items-center gap-2">
                  <CategoryEmoji icon={category.icon} size={16} />
                  <Text variant="body">{category.name}</Text>
                </View>
              ) : (
                <Text variant="body" tone="muted">
                  {I18n.t('transactions.editor.choose_category')}
                </Text>
              )}
            </PreviewRow>
          </>
        ) : null}

        {!isBalanceAdjustment ? (
          <>
            {DIVIDER}
            <PreviewRow label={I18n.t('transaction_detail.note')}>
              <Text variant="body" tone={note ? 'default' : 'muted'} numberOfLines={1}>
                {note || I18n.t('transactions.editor.optional')}
              </Text>
            </PreviewRow>
          </>
        ) : null}
      </View>
    </View>
  );
}
