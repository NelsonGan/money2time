import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

interface FlowMetricCardProps {
  label: string;
  value: React.ReactNode;
  tone: 'income' | 'expense';
  onPress?: () => void;
}

function FlowMetricCard({ label, value, tone, onPress }: FlowMetricCardProps) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const cardClassName = cn(
    'flex-1 rounded-[18px] border px-3 py-2.5 overflow-hidden',
    isIncome ? 'border-success/20 bg-success/8' : 'border-destructive/15 bg-destructive/6',
    onPress ? 'active:opacity-85' : undefined,
  );
  const content = (
    <>
      {/* Decorative corner blob */}
      <View
        className="absolute -top-3 -right-3 h-10 w-10 rounded-full"
        style={{
          backgroundColor: isIncome ? themeColors.success : themeColors.error,
          opacity: 0.06,
        }}
      />

      <View className="flex-row items-center gap-1.5">
        <View
          className={cn('h-1.5 w-1.5 rounded-full', isIncome ? 'bg-success' : 'bg-destructive')}
        />
        <Text
          variant="label"
          className={cn('text-[10px]', isIncome ? 'text-success' : 'text-destructive')}
        >
          {label}
        </Text>
      </View>
      <View className="mt-1">
        {typeof value === 'string' ? <Text variant="mono">{value}</Text> : value}
      </View>
    </>
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
