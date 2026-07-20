import { Car, Clock, Wallet } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import { OnboardingTryItConverter } from '~/features/onboarding/components/OnboardingTryItConverter';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
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
  featureList: {
    gap: spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
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
  const themeColors = useThemeColors();
  const swipeBackGesture = useEdgeSwipeBack(onBack);
  const [demoAmount, setDemoAmount] = React.useState('');
  const trueRateLabel = `${settings.currencySymbol}${(currentMonthWage?.trueHourlyRate ?? 0).toFixed(2)}/hr`;
  const rate = currentMonthWage?.trueHourlyRate ?? 0;
  const demoHours = amountToHoursByRate(Number(demoAmount) || 0, rate);
  const demoWorkdays = demoHours / 8;
  const demoWorkdaysPerWeek = Math.max(1, currentMonthWage?.workdaysPerWeek ?? 5);

  const inputs = [
    {
      icon: Wallet,
      title: I18n.t('onboarding.wage.bullet_pay_title'),
      subtitle: I18n.t('onboarding.wage.bullet_pay_subtitle'),
    },
    {
      icon: Clock,
      title: I18n.t('onboarding.wage.bullet_hours_title'),
      subtitle: I18n.t('onboarding.wage.bullet_hours_subtitle'),
    },
    {
      icon: Car,
      title: I18n.t('onboarding.wage.bullet_extra_title'),
      subtitle: I18n.t('onboarding.wage.bullet_extra_subtitle'),
    },
  ];

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
            <OnboardingStepHeader title={I18n.t('onboarding.wage.try_it_title')} mascot="excited" />

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
            <OnboardingStepHeader title={I18n.t('onboarding.wage.worth_title')} mascot="working" />

            <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-7">
              <View style={styles.featureList}>
                {inputs.map((input) => (
                  <Card key={input.title} variant="accent">
                    <CardContent style={styles.featureCard}>
                      <View
                        style={[
                          styles.featureIcon,
                          { backgroundColor: `${themeColors.primary}12` },
                        ]}
                      >
                        <input.icon size={22} color={themeColors.primary} />
                      </View>
                      <View style={styles.featureText}>
                        <Text variant="bodyStrong" className="text-foreground">
                          {input.title}
                        </Text>
                        <Text variant="caption" tone="muted" className="mt-1">
                          {input.subtitle}
                        </Text>
                      </View>
                    </CardContent>
                  </Card>
                ))}
              </View>

              <View className="mt-5 items-center">
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
              </View>
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
