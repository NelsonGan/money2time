import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import type { TransactionDisplaySettings } from '~/features/transactions/components/ActivityTransactionList';
import {
  LONG_PRESS_DELAY_MS,
  TransactionAccountBadge,
} from '~/features/transactions/components/TransactionItem';
import { isPaybackRow } from '~/features/transactions/lib/paybackGroups';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { formatAmount, normalizeMoneyAmount } from '~/utils/formatters';

interface PaybackGroupRowProps {
  billTitle: string | null;
  personNames: string[];
  transactions: TransactionWithRelations[];
  /** Open regardless of the toggle (it holds the row the list is flashing). */
  forceOpen: boolean;
  /** Long press: start selecting, as on a transaction (the list selects the paybacks). */
  onLongPress?: () => void;
  compact: boolean;
  settings: TransactionDisplaySettings;
  /** The paybacks themselves, shown under the row while it is open. */
  children: ReactNode;
}

/**
 * Two or more paybacks for one bill on one day, folded into a row in the
 * activity list (`foldPaybackRows`): the bill, how many paybacks and from
 * whom, and their total. Tapping it opens the paybacks underneath. Drawn like
 * a transaction card with the payback tint, so it sits in the day naturally.
 */
export function PaybackGroupRow({
  billTitle,
  personNames,
  transactions,
  forceOpen,
  onLongPress,
  compact,
  settings,
  children,
}: PaybackGroupRowProps) {
  const themeColors = useThemeColors();
  const { getAccountById } = useApp();
  // Its own state, so opening one group redraws only this row. The list keys
  // the row by day and bill, so a recycled cell starts closed.
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  // Totalled per currency: a payback is in the currency of the account it
  // leaves, while older ones were in the bill's, so one bill's paybacks can mix
  // two currencies, which must not be added together.
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    totals.set(tx.currency, (totals.get(tx.currency) ?? 0) + tx.amount);
  }
  const title = billTitle ?? I18n.t('transactions.settleUp.untitled_bill');
  const subtitle = [
    I18n.t('transactions.settleUp.payback_group', { count: transactions.length }),
    personNames.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
  const Chevron = expanded ? ChevronUp : ChevronDown;
  // The same third line as a payback's own row (from → to), so the folded row
  // is as tall as the rows around it. A bill's paybacks all leave its account;
  // several destinations read as the first one "+2". Paybacks that stayed in
  // the bill's account (payback rows) move nothing, so when every one did, the
  // line names that one account, as their own rows do.
  const first = transactions[0];
  const fromAccount = first?.fromAccountId ? getAccountById(first.fromAccountId) : undefined;
  const fromLabel: string =
    first?.fromAccountName || fromAccount?.name || I18n.t('common.no_account');
  const moved = transactions.filter((tx) => !isPaybackRow(tx));
  const firstMoved = moved[0];
  const toIds = new Set(transactions.map((tx) => tx.toAccountId ?? ''));
  const toAccount = firstMoved?.toAccountId ? getAccountById(firstMoved.toAccountId) : undefined;
  const toName: string =
    firstMoved?.toAccountName || toAccount?.name || I18n.t('common.no_account');
  const toLabel = toIds.size > 1 ? `${toName} +${toIds.size - 1}` : toName;
  const badgeClassName = compact ? 'min-w-[40px] shrink' : 'min-w-[44px] shrink';

  return (
    <View className={compact ? 'mb-1' : 'mb-1.5'}>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          setOpen(!expanded);
        }}
        onLongPress={
          onLongPress
            ? () => {
                void triggerHaptic('medium');
                onLongPress();
              }
            : undefined
        }
        delayLongPress={LONG_PRESS_DELAY_MS}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${subtitle}`}
        className={cn(
          'flex-row items-center border border-success/20 bg-success/5 shadow-soft overflow-hidden active:opacity-80',
          compact
            ? 'gap-2 py-2 pl-2.5 pr-2.5 rounded-[18px]'
            : 'gap-3 py-3 pl-0 pr-3.5 rounded-[22px]',
        )}
      >
        {!compact ? (
          <View
            className="ml-1 w-[3px] self-stretch rounded-full"
            style={{ backgroundColor: themeColors.success, opacity: 0.5 }}
          />
        ) : null}
        <View
          className={cn(
            'shrink-0 items-center justify-center rounded-full bg-success/15',
            compact ? 'h-8 w-8' : 'h-10 w-10',
          )}
        >
          <Text className={compact ? 'text-[15px]' : 'text-[18px]'}>↔️</Text>
          <View className="absolute -bottom-1 -right-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-success px-1">
            <Text className="text-[10px] font-bold leading-[12px] text-white">
              {transactions.length}
            </Text>
          </View>
        </View>
        <View className="min-w-0 flex-1 pr-1">
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            className={cn(
              'text-foreground',
              compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
            )}
          >
            {title}
          </Text>
          <Text
            variant="caption"
            tone="muted"
            numberOfLines={1}
            className={compact ? '' : 'mt-0.5'}
          >
            {subtitle}
          </Text>
          {firstMoved ? (
            <View
              collapsable={false}
              accessibilityLabel={`${fromLabel} → ${toLabel}`}
              className={cn(
                'min-w-0 flex-row items-center gap-1',
                compact ? 'mt-[2px]' : 'mt-[3px]',
              )}
            >
              <TransactionAccountBadge
                account={fromAccount}
                label={fromLabel}
                compact={compact}
                className={badgeClassName}
              />
              <View className="shrink-0">
                <ArrowRight size={compact ? 10 : 12} color={themeColors.textMuted} />
              </View>
              <TransactionAccountBadge
                account={toAccount}
                label={toLabel}
                compact={compact}
                className={badgeClassName}
              />
            </View>
          ) : (
            <TransactionAccountBadge
              account={fromAccount}
              label={fromLabel}
              compact={compact}
              className={compact ? 'mt-[2px]' : 'mt-[3px]'}
            />
          )}
        </View>
        <Text
          variant="mono"
          className={cn(
            'text-muted-foreground',
            compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
          )}
        >
          {[...totals]
            .map(([currency, total]) =>
              formatAmount(normalizeMoneyAmount(total), settings, {
                neutralSign: true,
                trueHourlyRate: 0,
                currencyCode: currency,
              }),
            )
            .join(' + ')}
        </Text>
        <Chevron size={16} color={themeColors.textMuted} />
      </Pressable>
      {expanded ? (
        <View className={cn('ml-3 border-l-2 border-success/20 pl-2', compact ? 'mt-1' : 'mt-1.5')}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
