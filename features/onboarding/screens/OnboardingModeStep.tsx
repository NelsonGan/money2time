import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { ONBOARDING_HORIZONTAL_PADDING } from '~/features/onboarding/constants/layout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingModeStepProps {
  onBack: () => void;
  onSelectSimple: () => void;
  onSelectPower: () => void;
}

const styles = StyleSheet.create({
  optionEmoji: {
    fontSize: 32,
    lineHeight: 40,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingTop: spacing.xl,
  },
});

export function OnboardingModeStep({
  onBack,
  onSelectSimple,
  onSelectPower,
}: OnboardingModeStepProps) {
  const themeColors = useThemeColors();
  const [selected, setSelected] = useState<'simple' | 'power' | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    void triggerHaptic('medium');
    if (selected === 'simple') onSelectSimple();
    else onSelectPower();
  };

  return (
    <View className="flex-1">
      <View style={styles.contentContainer}>
        <Animated.View entering={FadeInDown.delay(100).duration(500).springify().damping(16)}>
          <Text variant="label" tone="primary" className="text-center tracking-widest">
            {I18n.t('onboarding.mode.step_label')}
          </Text>
          <Text variant="title" className="text-center mt-2 text-foreground">
            {I18n.t('onboarding.mode.title')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)} className="mt-3">
          <Text variant="friendly" tone="muted" className="text-center px-2">
            {I18n.t('onboarding.mode.subtitle')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(350).duration(500)} className="mt-7 gap-4">
          {/* Simple mode card */}
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setSelected('simple');
            }}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('onboarding.mode.simple_title')}
            accessibilityState={{ selected: selected === 'simple' }}
            className="overflow-hidden rounded-[24px] active:scale-[0.98]"
            style={{
              borderWidth: selected === 'simple' ? 2 : 1,
              borderColor: selected === 'simple' ? themeColors.primary : `${themeColors.border}60`,
              backgroundColor:
                selected === 'simple' ? `${themeColors.primary}08` : themeColors.card,
            }}
          >
            {/* Decorative corner */}
            {selected === 'simple' ? (
              <View
                className="absolute -top-4 -right-4 h-16 w-16 rounded-full"
                style={{ backgroundColor: themeColors.primary, opacity: 0.08 }}
              />
            ) : null}

            <View className="py-5 px-5">
              <Text style={styles.optionEmoji}>✨</Text>
              <Text variant="heading" className="text-foreground mt-3">
                {I18n.t('onboarding.mode.simple_title')}
              </Text>
              <Text variant="body" tone="muted" className="mt-1.5">
                {I18n.t('onboarding.mode.simple_description')}
              </Text>
            </View>
          </Pressable>

          {/* Power mode card */}
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setSelected('power');
            }}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('onboarding.mode.power_title')}
            accessibilityState={{ selected: selected === 'power' }}
            className="overflow-hidden rounded-[24px] active:scale-[0.98]"
            style={{
              borderWidth: selected === 'power' ? 2 : 1,
              borderColor: selected === 'power' ? themeColors.primary : `${themeColors.border}60`,
              backgroundColor: selected === 'power' ? `${themeColors.primary}08` : themeColors.card,
            }}
          >
            {selected === 'power' ? (
              <View
                className="absolute -top-4 -right-4 h-16 w-16 rounded-full"
                style={{ backgroundColor: themeColors.primary, opacity: 0.08 }}
              />
            ) : null}

            <View className="py-5 px-5">
              <Text style={styles.optionEmoji}>⚡️</Text>
              <Text variant="heading" className="text-foreground mt-3">
                {I18n.t('onboarding.mode.power_title')}
              </Text>
              <Text variant="body" tone="muted" className="mt-1.5">
                {I18n.t('onboarding.mode.power_description')}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>

      <OnboardingActionBar
        onBack={() => {
          void triggerHaptic('selection');
          onBack();
        }}
        onPrimary={handleContinue}
        primaryLabel={I18n.t('common.continue')}
        primaryDisabled={!selected}
      />
    </View>
  );
}
