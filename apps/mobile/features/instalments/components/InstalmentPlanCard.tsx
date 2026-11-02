import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { Text } from '~/components/ui/text';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatAmount } from '~/utils/formatters';

import { formatPlanDay } from '../lib/format';
import type { InstalmentProgress } from '../lib/instalmentPlan';

/** Above this many payments the bar is one continuous fill instead of segments. */
const MAX_SEGMENTS = 24;

/** How far along a plan is: one segment per payment, filled when it is paid. */
export function InstalmentProgressBar({
  plan,
  height = 8,
}: {
  plan: InstalmentProgress;
  height?: number;
}) {
  const count = plan.entries.length;
  if (count > MAX_SEGMENTS || count === 0) {
    const ratio = count === 0 ? 0 : plan.paidCount / count;
    return (
      <View className="overflow-hidden rounded-full bg-secondary" style={{ height }}>
        <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </View>
    );
  }
  return (
    <View className="flex-row gap-1" style={{ height }}>
      {plan.entries.map((entry) => (
        <View
          key={entry.number}
          className={cn(
            'flex-1 rounded-full',
            entry.status === 'paid' || entry.status === 'paid_off'
              ? 'bg-primary'
              : entry.status === 'skipped'
                ? 'bg-muted-foreground/30'
                : 'bg-secondary',
          )}
        />
      ))}
    </View>
  );
}

/** A plan's name, category icon and where it stands, for the plans list. */
export function InstalmentPlanCard({
  plan,
  onPress,
}: {
  plan: InstalmentProgress;
  onPress: () => void;
}) {
  const { settings, getCategoryById } = useApp();
  const themeColors = useThemeColors();
  const { rule } = plan;
  const category = rule.categoryId ? getCategoryById(rule.categoryId) : undefined;
  const parent = category?.parentId ? getCategoryById(category.parentId) : undefined;
  const money = (amount: number) => formatAmount(amount, settings, { currencyCode: rule.currency });

  // "All paid" when every payment was made, paid off early included; a plan
  // that ended with skipped (deleted) payments is just finished.
  const status = plan.complete
    ? plan.paidCount === plan.entries.length
      ? I18n.t('instalments.status_complete')
      : I18n.t('instalments.section_finished')
    : plan.next
      ? I18n.t('instalments.next_payment_short', {
          date: formatPlanDay(plan.next.dateIso),
          amount: money(plan.next.amount),
        })
      : null;

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}
      accessibilityRole="button"
      className={cn(
        'gap-3 rounded-[22px] border border-border/30 bg-card px-4 py-3.5 active:opacity-80',
        plan.complete ? 'opacity-75' : '',
      )}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-secondary/60">
          <CategoryEmoji icon={category?.icon} parentIcon={parent?.icon} size={26} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
              {rule.name}
            </Text>
            <Text variant="bodyStrong" tone={plan.complete ? 'success' : 'primary'}>
              {I18n.t('instalments.paid_of', { paid: plan.paidCount, count: plan.entries.length })}
            </Text>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {status}
          </Text>
        </View>
        <ChevronRight size={16} color={themeColors.textMuted} />
      </View>
      <InstalmentProgressBar plan={plan} height={6} />
    </Pressable>
  );
}
