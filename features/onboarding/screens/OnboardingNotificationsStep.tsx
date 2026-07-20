import { CalendarCheck, RefreshCw, TrendingUp } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingNotificationsStepProps {
  onEnable: () => void;
  onSkip: () => void;
}

export function OnboardingNotificationsStep({
  onEnable,
  onSkip,
}: OnboardingNotificationsStepProps) {
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < 700;
  const ICON_SIZE = isCompact ? 18 : 22;

  const features = [
    {
      icon: CalendarCheck,
      title: I18n.t('onboarding.notifications.bullet_daily_title'),
      subtitle: I18n.t('onboarding.notifications.bullet_daily_subtitle'),
    },
    {
      icon: RefreshCw,
      title: I18n.t('onboarding.notifications.bullet_recurring_title'),
      subtitle: I18n.t('onboarding.notifications.bullet_recurring_subtitle'),
    },
    {
      icon: TrendingUp,
      title: I18n.t('onboarding.notifications.bullet_weekly_title'),
      subtitle: I18n.t('onboarding.notifications.bullet_weekly_subtitle'),
    },
  ];

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingStepHeader title={I18n.t('onboarding.notifications.title')} mascot="announce" />

        <Animated.View
          entering={FadeIn.delay(150).duration(300)}
          className={isCompact ? 'mt-5' : 'mt-7'}
        >
          <View style={styles.featureList}>
            {features.map((feature) => (
              <Card key={feature.title} variant="accent">
                <CardContent style={styles.featureCard}>
                  <View
                    style={[styles.featureIcon, { backgroundColor: `${themeColors.primary}12` }]}
                  >
                    <feature.icon size={ICON_SIZE} color={themeColors.primary} />
                  </View>
                  <View style={styles.featureText}>
                    <Text variant="bodyStrong" className="text-foreground">
                      {feature.title}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-1">
                      {feature.subtitle}
                    </Text>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <OnboardingActionBar
        onBack={() => {
          void triggerHaptic('selection');
          onSkip();
        }}
        onPrimary={() => {
          void triggerHaptic('medium');
          onEnable();
        }}
        backLabel={I18n.t('onboarding.notifications.not_now')}
        primaryLabel={I18n.t('onboarding.notifications.enable')}
      />
    </View>
  );
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
