import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import { OnboardingTryItConverter } from '~/features/onboarding/components/OnboardingTryItConverter';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthlyWageSettings, UserSettings } from '~/types';
import { amountToHoursByRate } from '~/utils/formatters';

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
  const [demoAmount, setDemoAmount] = React.useState('');
  const trueRateLabel = `${settings.currencySymbol}${(currentMonthWage?.trueHourlyRate ?? 0).toFixed(2)}/hr`;
  const rate = currentMonthWage?.trueHourlyRate ?? 0;
  const demoHours = amountToHoursByRate(Number(demoAmount) || 0, rate);
  const demoWorkdays = demoHours / 8;
  const demoWorkdaysPerWeek = Math.max(1, currentMonthWage?.workdaysPerWeek ?? 5);

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

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        {wageIsSet ? (
          <View className="flex-1">
            <OnboardingStepHeader title={I18n.t('onboarding.wage.try_it_title')} />

            <Animated.View entering={FadeIn.delay(150).duration(300)} className="flex-1 mt-6">
              <OnboardingTryItConverter
                amount={demoAmount}
                currencySymbol={settings.currencySymbol}
                hours={demoHours}
                workdays={demoWorkdays}
                workdaysPerWeek={demoWorkdaysPerWeek}
                trueRateLabel={trueRateLabel}
                onChangeAmount={setDemoAmount}
                onEditRate={() => {
                  void triggerHaptic('selection');
                  onOpenWageCalculator();
                }}
              />
            </Animated.View>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingStepHeader
              title={I18n.t('onboarding.wage.worth_title')}
              subtitle={I18n.t('onboarding.wage.worth_body')}
            />

            <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8">
              <Card variant="accent" className="overflow-hidden">
                <CardContent className="py-6">
                  <Text variant="label" tone="primary" className="tracking-widest">
                    {I18n.t('onboarding.wage.why_matters')}
                  </Text>
                  <Text variant="body" tone="muted" className="mt-3">
                    {I18n.t('onboarding.wage.why_matters_body', {
                      symbol: settings.currencySymbol,
                    })}
                  </Text>
                </CardContent>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(220).duration(300)} className="mt-4 items-center">
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
        )}

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onBack();
          }}
          onPrimary={() => {
            void triggerHaptic('medium');
            if (wageIsSet) {
              onContinue();
              return;
            }
            onOpenWageCalculator();
          }}
          primaryLabel={I18n.t(wageIsSet ? 'common.continue' : 'onboarding.wage.setup_wage')}
        />
      </View>
    </GestureDetector>
  );
}
