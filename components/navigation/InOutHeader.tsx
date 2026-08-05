import React from 'react';
import { Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

/**
 * The amount sits in roughly half the screen width minus the clay icon, which
 * on a 360dp Android phone leaves ~100dp. A long amount (RM11,616.67) used to
 * wrap to a second line and grow the card, so the value shrinks to fit one line
 * instead. Callers passing a node (time mode) must spread these onto their own
 * Text, since a node can't be reached from here.
 *
 * Shrinking runs out around `SUMMARY_VALUE_MAX_CHARS`
 * (`~/features/calendar/lib/summaryValue`); past that the caller is expected to
 * hand over an already-abbreviated value.
 */
export const IN_OUT_VALUE_TEXT_PROPS = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.7,
} as const;

interface FlowMetricCardProps {
  label: string;
  value: React.ReactNode;
  tone: 'income' | 'expense';
  onPress?: () => void;
}

function FlowMetricCard({ label, value, tone, onPress }: FlowMetricCardProps) {
  const isIncome = tone === 'income';
  const cardClassName = cn(
    'flex-1 rounded-[18px] border px-2.5 py-2.5 overflow-hidden',
    isIncome ? 'border-success/20 bg-success/8' : 'border-destructive/15 bg-destructive/6',
    onPress ? 'active:opacity-85' : undefined,
  );
  const content = (
    // Clay carries its own colour, so the artwork sits directly on the card's
    // tint — no second plate behind it.
    <View className="flex-row items-center gap-2">
      <ClayIcon name={isIncome ? 'money-time/wallet-in' : 'money-time/wallet-out'} size={22} />
      <View className="min-w-0 flex-1">
        <Text
          variant="label"
          className={cn('text-[10px]', isIncome ? 'text-success' : 'text-destructive')}
        >
          {label}
        </Text>
        <View className="mt-0.5">
          {typeof value === 'string' ? (
            <Text variant="mono" {...IN_OUT_VALUE_TEXT_PROPS}>
              {value}
            </Text>
          ) : (
            value
          )}
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return <View className={cardClassName}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cardClassName}
    >
      {content}
    </Pressable>
  );
}

export function InOutHeader({
  incomeValue,
  expenseValue,
  className,
  onIncomePress,
  onExpensePress,
}: {
  incomeValue: React.ReactNode;
  expenseValue: React.ReactNode;
  className?: string;
  onIncomePress?: () => void;
  onExpensePress?: () => void;
}) {
  return (
    <View className={cn('w-full flex-row items-center gap-2', className)}>
      <FlowMetricCard
        label={I18n.t('nav.income')}
        value={incomeValue}
        tone="income"
        onPress={onIncomePress}
      />
      <FlowMetricCard
        label={I18n.t('nav.expense')}
        value={expenseValue}
        tone="expense"
        onPress={onExpensePress}
      />
    </View>
  );
}
