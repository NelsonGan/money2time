import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Card, CardContent, Text } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthlyWageSettings, UserSettings } from '~/types';

interface OnboardingWageStepProps {
  settings: UserSettings;
  currentMonthWage: MonthlyWageSettings | null;
  wageIsSet: boolean;
  onBack: () => void;
  onContinue: () => void;
  onOpenWageCalculator: () => void;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
});

export function OnboardingWageStep({
  settings,
  currentMonthWage,
  wageIsSet,
  onBack,
  onContinue,
  onOpenWageCalculator,
}: OnboardingWageStepProps) {
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  const handleDoLater = () => {
    void triggerHaptic('selection');
    Alert.alert(I18n.t('onboarding.wage.skip_title'), I18n.t('onboarding.wage.skip_message'), [
      { text: I18n.t('onboarding.wage.set_now'), style: 'cancel' },
      {
        text: I18n.t('onboarding.wage.skip_now'),
        onPress: () => onContinue(),
      },
    ]);
  };

  if (wageIsSet) {
    return (
      <GestureDetector gesture={swipeBackGesture}>
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Mascot */}
            <Animated.View entering={FadeIn.duration(500)} className="items-center mt-8">
              <View accessibilityElementsHidden>
                <Mascot size={92} mood="proud" animate />
              </View>
            </Animated.View>

            {/* Headline */}
            <Animated.View
              entering={FadeInDown.delay(100).duration(500).springify().damping(16)}
              className="mt-5"
            >
              <Text variant="title" className="text-center text-foreground">
                {I18n.t('onboarding.wage.set_title')}
              </Text>
              <Text variant="friendly" tone="muted" className="text-center mt-2">
                {I18n.t('onboarding.wage.set_subtitle')}
              </Text>
            </Animated.View>

            {/* Rate hero card */}
            <Animated.View entering={FadeIn.delay(250).duration(500)} className="mt-7">
              <Card variant="hero" className="overflow-hidden">
                <CardContent className="py-7 items-center">
                  {/* Decorative inner glow */}
                  <View
                    className="absolute -top-8 -left-8 h-24 w-24 rounded-full"
                    style={{ backgroundColor: '#fff', opacity: 0.06 }}
                  />
                  <Text variant="label" tone="inverse" className="tracking-widest opacity-70">
                    {I18n.t('onboarding.wage.true_rate_title')}
                  </Text>
                  <Text variant="hero" tone="inverse" className="mt-3">
                    {settings.currencySymbol}
                    {(currentMonthWage?.trueHourlyRate ?? 0).toFixed(2)}/hr
                  </Text>
                  <Text variant="caption" tone="inverse" className="mt-3 opacity-60">
                    {I18n.t('onboarding.wage.true_rate_based_on')}
                  </Text>
                </CardContent>
              </Card>
            </Animated.View>

            {/* Recalculate option */}
            <Animated.View entering={FadeIn.delay(400).duration(400)} className="mt-4">
              <Button
                variant="outline"
                haptic="none"
                onPress={() => {
                  void triggerHaptic('selection');
                  onOpenWageCalculator();
                }}
              >
                <Text>{I18n.t('onboarding.wage.recalculate')}</Text>
              </Button>
            </Animated.View>
          </ScrollView>

          <OnboardingActionBar
            onBack={() => {
              void triggerHaptic('selection');
              onBack();
            }}
            onPrimary={() => {
              void triggerHaptic('medium');
              onContinue();
            }}
            primaryLabel={I18n.t('common.continue')}
          />
        </View>
      </GestureDetector>
    );
  }

  // Wage NOT set
  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Mascot */}
          <Animated.View entering={FadeIn.duration(500)} className="items-center mt-8">
            <View accessibilityElementsHidden>
              <Mascot size={92} mood="thinking" animate />
            </View>
          </Animated.View>

          {/* Headline */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(500).springify().damping(16)}
            className="mt-5"
          >
            <Text variant="title" className="text-center text-foreground">
              {I18n.t('onboarding.wage.worth_title')}
            </Text>
            <Text variant="friendly" tone="muted" className="text-center mt-2 px-2">
              {I18n.t('onboarding.wage.worth_body')}
            </Text>
          </Animated.View>

          {/* Why this matters card */}
          <Animated.View entering={FadeIn.delay(250).duration(500)} className="mt-7">
            <Card variant="accent" className="overflow-hidden">
              <CardContent className="py-6">
                <Text variant="label" tone="primary" className="tracking-widest">
                  {I18n.t('onboarding.wage.why_matters')}
                </Text>
                <Text variant="body" tone="muted" className="mt-3">
                  {I18n.t('onboarding.wage.why_matters_body', { symbol: settings.currencySymbol })}
                </Text>
              </CardContent>
            </Card>
          </Animated.View>

          {/* Set up wage CTA */}
          <Animated.View entering={FadeIn.delay(400).duration(400)} className="mt-6">
            <Button
              haptic="none"
              className="shadow-glow-lg"
              onPress={() => {
                void triggerHaptic('medium');
                onOpenWageCalculator();
              }}
            >
              <Text>{I18n.t('onboarding.wage.setup_wage')}</Text>
            </Button>
          </Animated.View>

          {/* Do later link */}
          <Animated.View entering={FadeIn.delay(500).duration(400)} className="mt-4 items-center">
            <Pressable
              onPress={handleDoLater}
              className="py-2"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('onboarding.wage.later_a11y')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('onboarding.wage.later_label')}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onBack();
          }}
          onPrimary={() => {
            void triggerHaptic('medium');
            onContinue();
          }}
          primaryLabel={I18n.t('common.continue')}
          primaryDisabled={!wageIsSet}
        />
      </View>
    </GestureDetector>
  );
}
