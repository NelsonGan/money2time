import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

interface FlowMetricCardProps {
  label: string;
  value: string;
  tone: 'income' | 'expense';
}

function FlowMetricCard({ label, value, tone }: FlowMetricCardProps) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  return (
    <View
      className={cn(
        'flex-1 rounded-[18px] border px-3 py-2.5 overflow-hidden',
        isIncome ? 'border-success/20 bg-success/8' : 'border-destructive/15 bg-destructive/6',
      )}
    >
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
      <Text variant="mono" className="mt-1">
        {value}
      </Text>
    </View>
  );
}

export function InOutHeader({
  incomeValue,
  expenseValue,
  className,
}: {
  incomeValue: string;
  expenseValue: string;
  className?: string;
}) {
  return (
    <View className={cn('w-full flex-row items-center gap-2', className)}>
      <FlowMetricCard label={I18n.t('nav.income')} value={incomeValue} tone="income" />
      <FlowMetricCard label={I18n.t('nav.expense')} value={expenseValue} tone="expense" />
    </View>
  );
}
