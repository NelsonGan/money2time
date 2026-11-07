import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import type { TransactionDisplaySettings } from '~/features/transactions/components/ActivityTransactionList';
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
  expanded: boolean;
  onToggle: () => void;
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
  expanded,
  onToggle,
  compact,
  settings,
  children,
}: PaybackGroupRowProps) {
  const themeColors = useThemeColors();
  const total = normalizeMoneyAmount(transactions.reduce((sum, tx) => sum + tx.amount, 0));
  const title = billTitle ?? I18n.t('transactions.settleUp.untitled_bill');
  const subtitle = [
    I18n.t('transactions.settleUp.payback_group', { count: transactions.length }),
    personNames.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View className={compact ? 'mb-1' : 'mb-1.5'}>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onToggle();
        }}
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
        </View>
        <Text
          variant="mono"
          className={cn(
            'text-muted-foreground',
            compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
          )}
        >
          {formatAmount(total, settings, {
            neutralSign: true,
            trueHourlyRate: 0,
            currencyCode: transactions[0]?.currency,
          })}
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
