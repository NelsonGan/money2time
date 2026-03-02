import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

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
            <Animated.View entering={FadeIn.delay(100).duration(400)} className="mt-5">
              <Text variant="heading" className="text-center text-foreground">
                {I18n.t('onboarding.wage.set_title')}
              </Text>
              <Text variant="friendly" tone="secondary" className="text-center mt-2">
                {I18n.t('onboarding.wage.set_subtitle')}
              </Text>
            </Animated.View>

            {/* Rate hero card — bg-primary (dark teal), all text must be white/inverse */}
            <Animated.View entering={FadeIn.delay(250).duration(500)} className="mt-7">
              <Card variant="hero">
                <CardContent className="py-6 items-center">
                  <Text
                    variant="label"
                    tone="inverse"
                    className="uppercase tracking-wider opacity-70"
                  >
                    {I18n.t('onboarding.wage.true_rate_title')}
                  </Text>
                  <Text variant="display" tone="inverse" className="mt-2">
                    {settings.currencySymbol}
                    {(currentMonthWage?.trueHourlyRate ?? 0).toFixed(2)}/hr
                  </Text>
                  <Text variant="label" tone="inverse" className="mt-2 opacity-70">
                    {I18n.t('onboarding.wage.true_rate_based_on')}
                  </Text>
                </CardContent>
              </Card>
            </Animated.View>

            {/* Recalculate option */}
            <Animated.View entering={FadeIn.delay(400).duration(400)} className="mt-4">
              <Button
                variant="outline"
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
          <Animated.View entering={FadeIn.delay(100).duration(400)} className="mt-5">
            <Text variant="heading" className="text-center text-foreground">
              {I18n.t('onboarding.wage.worth_title')}
            </Text>
            <Text variant="friendly" tone="secondary" className="text-center mt-2 px-2">
              {I18n.t('onboarding.wage.worth_body')}
            </Text>
          </Animated.View>

          {/* Why this matters card */}
          <Animated.View entering={FadeIn.delay(250).duration(500)} className="mt-7">
            <Card>
              <CardContent className="py-5">
                <Text variant="label" tone="muted" className="uppercase tracking-wider">
                  {I18n.t('onboarding.wage.why_matters')}
                </Text>
                <Text variant="friendly" tone="secondary" className="mt-2.5">
                  {I18n.t('onboarding.wage.why_matters_body', { symbol: settings.currencySymbol })}
                </Text>
              </CardContent>
            </Card>
          </Animated.View>

          {/* Set up wage CTA */}
          <Animated.View entering={FadeIn.delay(400).duration(400)} className="mt-6">
            <Button
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
