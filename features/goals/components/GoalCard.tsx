import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';

import { CategoryEmoji, Text } from '~/components/ui';
import { AnimatedProgressFill } from '~/components/ui/AnimatedProgressFill';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getGoalCoverUri } from '~/services/userAssets';
import type { GoalWithProgress } from '~/types';
import { formatAmount } from '~/utils/formatters';

const MASKED_VALUE = '••••';
const PRESS_EASE = cubicBezier(0.23, 1, 0.32, 1);

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

  const coverUri = useMemo(() => getGoalCoverUri(account.goalCoverUri), [account.goalCoverUri]);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  const effectiveCoverUri = coverUri !== brokenUri ? coverUri : null;

  const percent = Math.round(progress.ratio * 100);
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
    <Animated.View
      style={{
        transform: [{ scale: pressed && !reducedMotion ? 0.97 : 1 }],
        transitionProperty: 'transform',
        transitionDuration: reducedMotion ? '0ms' : '120ms',
        transitionTimingFunction: PRESS_EASE,
      }}
    >
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress(account.id);
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        pressRetentionOffset={16}
        accessibilityRole="button"
        accessibilityLabel={account.name}
        className="overflow-hidden rounded-[22px] border border-border/30 bg-card"
      >
        {/* Optional cover photo, as a 2:1 banner above the readout — the same
          proportion the album cards use, so the two rails read as one idea. */}
        {effectiveCoverUri ? (
          <Image
            source={{ uri: effectiveCoverUri }}
            style={{ width: '100%', aspectRatio: 2 }}
            contentFit="cover"
            transition={120}
            onError={() => setBrokenUri(effectiveCoverUri)}
          />
        ) : null}

        <View className="px-4 py-3.5">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-secondary/40">
              <CategoryEmoji icon={account.goalEmoji || 'target'} style={{ fontSize: 20 }} />
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
            <AnimatedProgressFill
              ratio={progress.ratio}
              color={achieved ? themeColors.success : themeColors.primary}
              style={{ borderRadius: 8 }}
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});
