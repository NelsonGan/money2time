import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { motionDurations } from '~/constants/motion';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatCurrency } from '~/utils/formatters';
import { FONT } from '~/utils/fonts';

import {
  earnedByNow,
  formatElapsedClock,
  type LiveEarningsSession,
  sessionProgress,
} from '../lib/liveEarnings';

const RIPPLE_MS = 1800;

/**
 * A broadcast ripple rather than a blinking dot: the ring grows out of a steady
 * centre and fades, which reads as "transmitting" instead of "error".
 */
function LiveDot() {
  const ripple = useSharedValue(0);

  useEffect(() => {
    // One timing per repetition, not a sequence: a non-reversing withRepeat
    // re-runs its inner animation from wherever the value currently sits, so a
    // sequence ending at 1 makes every later pass a no-op and the ring pulses
    // exactly once. Easing.out spends most of the cycle near the end, faded
    // out, which is the beat of stillness the sequence was reaching for.
    ripple.value = 0;
    ripple.value = withRepeat(
      withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [ripple]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ripple.value),
    transform: [{ scale: 1 + ripple.value * 2.4 }],
  }));

  return (
    <View className="h-1.5 w-1.5 items-center justify-center">
      <Animated.View
        className="absolute h-1.5 w-1.5 rounded-full bg-primary"
        style={ringStyle}
        pointerEvents="none"
      />
      <View className="h-1.5 w-1.5 rounded-full bg-primary" />
    </View>
  );
}

/** Glides to each new value instead of stepping, so the fill reads as motion. */
function SessionBar({ progress }: { progress: number }) {
  const themeColors = useThemeColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(trackWidth * progress, {
      duration: motionDurations.normal,
      easing: Easing.out(Easing.cubic),
    });
  }, [fill, progress, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.value }));

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      className="h-1.5 overflow-hidden rounded-full"
      style={{ backgroundColor: themeColors.surfaceMuted }}
    >
      <Animated.View className="h-full rounded-full bg-primary" style={fillStyle} />
    </View>
  );
}

interface LiveEarningsPreviewProps {
  session: LiveEarningsSession;
  /** Epoch ms, re-rendered on a fast tick so the amount visibly counts up. */
  now: number;
  currencySymbol: string;
  /** Formatted end-of-session time, e.g. "Ends 5:00 PM". */
  endsText: string;
}

/**
 * An in-app rendering of the Live Activity card, laid out to match it piece for
 * piece. Unlike the real one this ticks continuously, which is the whole point
 * of showing it: it is what the feature looks like when it is working.
 *
 * Amounts go through `formatCurrency` rather than `formatAmount` on purpose.
 * In time display mode `formatAmount` would divide the amount by the very
 * hourly rate that produced it, so the "earned" figure would render as the
 * elapsed time already shown beside it.
 */
export function LiveEarningsPreview({
  session,
  now,
  currencySymbol,
  endsText,
}: LiveEarningsPreviewProps) {
  const earned = earnedByNow(session, now);
  const rateText = I18n.t('widgets.live.rate', {
    amount: formatCurrency(session.hourlyRate, currencySymbol),
  });

  return (
    <View className="gap-2.5 rounded-[28px] border border-border/50 bg-card px-4 py-4">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          <LiveDot />
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {I18n.t('widgets.live.headline')}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {rateText}
        </Text>
      </View>

      {/* The amount owns its row outright, exactly as on the Lock Screen card. */}
      <Text
        className="text-primary text-[40px] leading-[46px] tracking-tight"
        style={{ fontFamily: FONT.monoBold }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatCurrency(earned, currencySymbol)}
      </Text>

      <View className="gap-2 pt-0.5">
        <SessionBar progress={sessionProgress(session, now)} />
        <View className="flex-row items-center justify-between gap-3">
          <Text
            variant="caption"
            tone="muted"
            style={{ fontFamily: FONT.monoBold }}
            numberOfLines={1}
          >
            {formatElapsedClock(session, now)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {endsText}
          </Text>
        </View>
      </View>
    </View>
  );
}
