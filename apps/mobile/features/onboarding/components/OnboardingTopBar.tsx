import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingTopBarProps {
  /** 1-based position among the steps that show the bar. */
  step: number;
  total: number;
  onBack: () => void;
}

/** A back chevron and one thin progress bar, the only chrome above a step. */
export function OnboardingTopBar({ step, total, onBack }: OnboardingTopBarProps) {
  const themeColors = useThemeColors();
  const progress = useSharedValue(step / total);

  useEffect(() => {
    progress.value = withTiming(step / total, { duration: 320 });
  }, [progress, step, total]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="h-12 flex-row items-center gap-3 px-3">
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onBack();
        }}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary/80"
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.back')}
      >
        <ChevronLeft size={24} color={themeColors.text} strokeWidth={2.2} />
      </Pressable>
      <View
        className="mr-5 h-1.5 flex-1 overflow-hidden rounded-full bg-border/30"
        accessibilityRole="progressbar"
        accessibilityLabel={I18n.t('onboarding.flow.step_a11y', { step, total })}
      >
        <Animated.View className="h-full rounded-full bg-primary" style={fillStyle} />
      </View>
    </View>
  );
}
