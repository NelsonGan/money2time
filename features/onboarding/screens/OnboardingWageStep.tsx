import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Card, CardContent, Text } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
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
  const themeColors = useThemeColors();
  const wageAmountLabel = `${settings.currencySymbol}${(currentMonthWage?.wageAmount ?? 0).toFixed(2)}`;
  const trueRateLabel = `${settings.currencySymbol}${(currentMonthWage?.trueHourlyRate ?? 0).toFixed(2)}/hr`;
  const weeklyHoursLabel = `${currentMonthWage?.hoursWorkedPerWeek ?? 0}h · ${currentMonthWage?.workdaysPerWeek ?? 0}d`;
  const commuteLabel = `${currentMonthWage?.commuteMinutesPerWorkday ?? 0} min`;

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
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader
            title={I18n.t(wageIsSet ? 'onboarding.wage.set_title' : 'onboarding.wage.worth_title')}
            subtitle={I18n.t(
              wageIsSet ? 'onboarding.wage.set_subtitle' : 'onboarding.wage.worth_body',
            )}
          />

          {wageIsSet ? (
            <>
              <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8">
                <Card variant="hero" className="overflow-hidden">
                  <CardContent className="items-center py-7">
                    <Text variant="label" tone="inverse" className="tracking-widest opacity-70">
                      {I18n.t('onboarding.wage.true_rate_title')}
                    </Text>
                    <Text variant="hero" tone="inverse" className="mt-3">
                      {trueRateLabel}
                    </Text>
                    <Text variant="caption" tone="inverse" className="mt-3 opacity-60">
                      {I18n.t('onboarding.wage.true_rate_based_on')}
                    </Text>
                  </CardContent>
                </Card>
              </Animated.View>

              <Animated.View entering={FadeIn.delay(220).duration(300)} className="mt-4">
                <Card variant="default" className="border border-border/25">
                  <CardContent className="py-1">
                    <SummaryRow
                      label={I18n.t(`wage.type.${currentMonthWage?.wageType ?? 'monthly'}`)}
                      value={wageAmountLabel}
                    />
                    <View
                      style={[styles.divider, { backgroundColor: `${themeColors.border}55` }]}
                    />
                    <SummaryRow label={I18n.t('wage.hours_per_week')} value={weeklyHoursLabel} />
                    <View
                      style={[styles.divider, { backgroundColor: `${themeColors.border}55` }]}
                    />
                    <SummaryRow label={I18n.t('wage.commute_minutes')} value={commuteLabel} />
                  </CardContent>
                </Card>
              </Animated.View>

              <Animated.View entering={FadeIn.delay(280).duration(300)} className="mt-4">
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
            </>
          ) : (
            <>
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

              <Animated.View
                entering={FadeIn.delay(220).duration(300)}
                className="mt-4 items-center"
              >
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
            </>
          )}
        </ScrollView>

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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="bodyStrong" className="text-right text-foreground">
        {value}
      </Text>
    </View>
  );
}
