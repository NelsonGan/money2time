import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, CardContent, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
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
    fontSize: 18,
  },
});

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
  onSkip,
}: OnboardingValuePropStepProps) {
  const sym = currencySymbol;

  return (
    <View style={styles.container}>
      {/* Content area */}
      <View style={styles.contentArea}>
        {/* Overline + Hero */}
        <Animated.View entering={FadeIn.delay(100).duration(400)}>
          <Text variant="label" tone="muted" className="text-center uppercase tracking-wider">
            {I18n.t('onboarding.value_prop.welcome')}
          </Text>
          <Text variant="display" className="text-center mt-2 text-foreground">
            {I18n.t('onboarding.value_prop.title')}
          </Text>
        </Animated.View>

        {/* Body text */}
        <Animated.View entering={FadeIn.delay(200).duration(400)} className="mt-4">
          <Text variant="friendly" tone="secondary" className="text-center px-2">
            {I18n.t('onboarding.value_prop.body')}
          </Text>
        </Animated.View>

        {/* Conversion example card */}
        <Animated.View entering={FadeIn.delay(350).duration(500)} className="mt-7">
          <Card variant="soft" className="border border-primary/20">
            <CardContent className="py-5 items-center">
              <Text variant="label" tone="muted" className="uppercase tracking-wider">
                {I18n.t('onboarding.value_prop.example')}
              </Text>
              <Text variant="heading" className="mt-2 text-foreground">
                {sym}25.00
              </Text>
              <Text variant="subheading" className="text-primary mt-1">
                {I18n.t('onboarding.value_prop.example_work')}
              </Text>
              <Text variant="label" tone="muted" className="mt-2">
                {I18n.t('onboarding.value_prop.example_rate', { symbol: sym })}
              </Text>
            </CardContent>
          </Card>
        </Animated.View>

        {/* Display modes */}
        <Animated.View entering={FadeIn.delay(500).duration(400)} className="mt-4 gap-3">
          <Card variant="soft" className="border border-border/30">
            <CardContent className="py-3.5 flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <Text style={styles.modeIcon}>💵</Text>
              </View>
              <View className="flex-1">
                <Text variant="caption" className="text-foreground">
                  {I18n.t('onboarding.value_prop.money_mode')}
                </Text>
                <Text variant="label" tone="muted">
                  {I18n.t('onboarding.value_prop.money_mode_subtitle')}
                </Text>
              </View>
            </CardContent>
          </Card>
          <Card variant="soft" className="border border-border/30">
            <CardContent className="py-3.5 flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-accent/15 items-center justify-center">
                <Text style={styles.modeIcon}>⏱️</Text>
              </View>
              <View className="flex-1">
                <Text variant="caption" className="text-foreground">
                  {I18n.t('onboarding.value_prop.time_mode')}
                </Text>
                <Text variant="label" tone="muted">
                  {I18n.t('onboarding.value_prop.time_mode_subtitle')}
                </Text>
              </View>
            </CardContent>
          </Card>
        </Animated.View>
      </View>

      {/* Footer */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Button
          haptic="none"
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
