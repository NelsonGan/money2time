import React from 'react';
import { Pressable, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { GoalWithProgress } from '~/types';
import { formatAmount } from '~/utils/formatters';

const MASKED_VALUE = '••••';

function PaceChip({ pace }: { pace: NonNullable<GoalWithProgress['progress']['pace']> }) {
  const label =
    pace === 'achieved'
      ? I18n.t('goals.pace_achieved')
      : pace === 'onTrack'
        ? I18n.t('goals.pace_on_track')
        : I18n.t('goals.pace_behind');
  return (
    <View
      className={
        pace === 'behind'
          ? 'rounded-full bg-secondary px-2 py-0.5'
          : 'rounded-full bg-primary/15 px-2 py-0.5'
      }
    >
      <Text
        variant="caption"
        className={pace === 'behind' ? 'text-muted-foreground' : 'text-primary'}
      >
        {label}
      </Text>
    </View>
  );
}

/** Compact progress card for one savings goal on the Goals rail. */
export const GoalCard = React.memo(function GoalCard({
  goal,
  hideBalances,
  onPress,
}: {
  goal: GoalWithProgress;
  hideBalances: boolean;
  onPress: (accountId: string) => void;
}) {
  const { settings, currentMonthWage } = useApp();
  const themeColors = useThemeColors();
  const { account, progress } = goal;
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  const percent = Math.round(progress.ratio * 100);
  const fillRatio = Math.max(0, Math.min(1, progress.ratio));
  const achieved = progress.pace === 'achieved';
  const savedLabel = hideBalances
    ? MASKED_VALUE
    : formatAmount(progress.saved, settings, {
        trueHourlyRate,
        currencyCode: account.currency,
      });
  const targetLabel = hideBalances
    ? MASKED_VALUE
    : formatAmount(progress.target, settings, {
        trueHourlyRate,
        currencyCode: account.currency,
      });

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress(account.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={account.name}
      className="rounded-[22px] border border-border/30 bg-card px-4 py-3.5"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-secondary/40">
          <CategoryEmoji icon={account.goalEmoji || '🎯'} style={{ fontSize: 20 }} />
        </View>
        <View className="flex-1">
          <Text variant="body" numberOfLines={1}>
            {account.name}
          </Text>
          <Text variant="caption" tone="muted" className="mt-0.5">
            {I18n.t('goals.saved_of_target', { saved: savedLabel, target: targetLabel })}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text variant="mono" className={achieved ? 'text-primary' : undefined}>
            {percent}%
          </Text>
          {progress.pace ? <PaceChip pace={progress.pace} /> : null}
        </View>
      </View>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/60">
        <View
          className="h-2 rounded-full"
          style={{
            width: `${fillRatio * 100}%`,
            backgroundColor: achieved ? themeColors.success : themeColors.primary,
          }}
        />
      </View>
    </Pressable>
  );
});
