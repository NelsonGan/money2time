import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, CardContent, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingValuePropStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
  onSkip: () => void;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenHorizontal,
    justifyContent: 'space-between',
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingTop: spacing.sm,
  },
  modeIcon: {
    fontSize: 20,
  },
});

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
  onSkip,
}: OnboardingValuePropStepProps) {
  const themeColors = useThemeColors();
  const sym = currencySymbol;

  return (
    <View style={styles.container}>
      {/* Content area */}
      <View style={styles.contentArea}>
        {/* Overline + Hero */}
        <Animated.View entering={FadeInDown.delay(100).duration(500).springify().damping(16)}>
          <Text variant="label" tone="primary" className="text-center tracking-widest">
            {I18n.t('onboarding.value_prop.welcome')}
          </Text>
          <Text variant="hero" className="text-center mt-3 text-foreground">
            {I18n.t('onboarding.value_prop.title')}
          </Text>
        </Animated.View>

        {/* Body text */}
        <Animated.View entering={FadeIn.delay(300).duration(400)} className="mt-4">
          <Text variant="friendly" tone="muted" className="text-center px-4 leading-6">
            {I18n.t('onboarding.value_prop.body')}
          </Text>
        </Animated.View>

        {/* Conversion example — dramatic visual */}
        <Animated.View
          entering={FadeInDown.delay(450).duration(500).springify().damping(16)}
          className="mt-8"
        >
          <Card variant="accent" className="overflow-hidden">
            <CardContent className="py-6 items-center">
              {/* Decorative background */}
              <View
                className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full"
                style={{ backgroundColor: themeColors.primary, opacity: 0.05 }}
              />

              <Text variant="label" tone="primary" className="tracking-widest">
                {I18n.t('onboarding.value_prop.example')}
              </Text>
              <Text variant="display" className="mt-3 text-foreground tracking-tighter">
                {sym}25.00
              </Text>
              <View className="flex-row items-center mt-2 gap-2">
                <View className="h-px flex-1 bg-border/40" />
                <Text variant="caption" tone="muted">
                  =
                </Text>
                <View className="h-px flex-1 bg-border/40" />
              </View>
              <Text variant="heading" className="text-primary mt-2">
                {I18n.t('onboarding.value_prop.example_work')}
              </Text>
              <Text variant="caption" tone="muted" className="mt-2">
                {I18n.t('onboarding.value_prop.example_rate', { symbol: sym })}
              </Text>
            </CardContent>
          </Card>
        </Animated.View>

        {/* Display modes */}
        <Animated.View entering={FadeIn.delay(600).duration(400)} className="mt-5 gap-2.5">
          <View className="rounded-[22px] border border-border/25 bg-card px-4 py-3.5 flex-row items-center gap-3.5 shadow-soft">
            <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
              <Text style={styles.modeIcon}>💵</Text>
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong" className="text-foreground">
                {I18n.t('onboarding.value_prop.money_mode')}
              </Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('onboarding.value_prop.money_mode_subtitle')}
              </Text>
            </View>
          </View>
          <View className="rounded-[22px] border border-border/25 bg-card px-4 py-3.5 flex-row items-center gap-3.5 shadow-soft">
            <View className="w-11 h-11 rounded-2xl bg-accent/12 items-center justify-center">
              <Text style={styles.modeIcon}>⏱️</Text>
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong" className="text-foreground">
                {I18n.t('onboarding.value_prop.time_mode')}
              </Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('onboarding.value_prop.time_mode_subtitle')}
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Footer */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Button
          haptic="none"
          className="shadow-glow-lg"
          onPress={() => {
            void triggerHaptic('medium');
            onGetStarted();
          }}
        >
          <Text>{I18n.t('onboarding.value_prop.get_started')}</Text>
        </Button>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onSkip();
          }}
          className="mt-3 items-center py-2"
          accessibilityRole="button"
          accessibilityLabel={I18n.t('onboarding.skip_setup_label')}
        >
          <Text variant="caption" tone="muted">
            {I18n.t('onboarding.value_prop.skip_setup')}
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
