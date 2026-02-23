import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';
import { cn } from '~/utils';
import { I18n } from '~/lib/i18n';

interface FlowMetricCardProps {
  label: string;
  value: string;
  tone: 'income' | 'expense';
}

function FlowMetricCard({ label, value, tone }: FlowMetricCardProps) {
  const isIncome = tone === 'income';
  return (
    <View
      className={cn(
        'flex-1 rounded-[14px] border px-2.5 py-1.5',
        isIncome ? 'border-success/25 bg-success/10' : 'border-destructive/20 bg-destructive/8',
      )}
    >
      <View className="flex-row items-center gap-1.5">
        <View
          className={cn('h-1.5 w-1.5 rounded-full', isIncome ? 'bg-success' : 'bg-destructive')}
        />
        <Text variant="label" className={cn(isIncome ? 'text-success' : 'text-destructive')}>
          {label}
        </Text>
      </View>
      <Text variant="caption" className="mt-0.5">
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
    <View className={cn('w-full flex-row items-center gap-1.5', className)}>
      <FlowMetricCard label={I18n.t('nav.income')} value={incomeValue} tone="income" />
      <FlowMetricCard label={I18n.t('nav.expense')} value={expenseValue} tone="expense" />
    </View>
  );
}
