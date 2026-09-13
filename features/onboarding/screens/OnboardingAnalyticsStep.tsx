import { BarChart3, EyeOff, SlidersHorizontal } from 'lucide-react-native';
import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
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

const PRIVACY_URL = 'https://www.money2time.com/privacy';

interface OnboardingAnalyticsStepProps {
  onEnable: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function OnboardingAnalyticsStep({
  onEnable,
  onSkip,
  onBack,
}: OnboardingAnalyticsStepProps) {
  const themeColors = useThemeColors();
  const swipeBackGesture = useEdgeSwipeBack(onBack);
  const { height: windowHeight } = useWindowDimensions();
  const iconSize = windowHeight < 700 ? 18 : 22;

  const points = [
    {
      icon: BarChart3,
      title: I18n.t('onboarding.analytics.bullet_usage_title'),
      subtitle: I18n.t('onboarding.analytics.bullet_usage_subtitle'),
    },
    {
      icon: EyeOff,
      title: I18n.t('onboarding.analytics.bullet_private_title'),
      subtitle: I18n.t('onboarding.analytics.bullet_private_subtitle'),
    },
    {
      icon: SlidersHorizontal,
      title: I18n.t('onboarding.analytics.bullet_control_title'),
      subtitle: I18n.t('onboarding.analytics.bullet_control_subtitle'),
    },
  ];

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader title={I18n.t('onboarding.analytics.title')} mascot="thinking" />

          <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-6">
            <View style={styles.pointList}>
              {points.map((point) => (
                <Card key={point.title} variant="accent">
                  <CardContent style={styles.pointCard}>
                    <View
                      style={[styles.pointIcon, { backgroundColor: `${themeColors.primary}12` }]}
                    >
                      <point.icon size={iconSize} color={themeColors.primary} />
                    </View>
                    <View style={styles.pointText}>
                      <Text variant="bodyStrong" className="text-foreground">
                        {point.title}
                      </Text>
                      <Text variant="caption" tone="muted" className="mt-1">
                        {point.subtitle}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              ))}
            </View>

            <Pressable
              onPress={() => void Linking.openURL(PRIVACY_URL)}
              className="mt-4 items-center py-2"
              accessibilityRole="link"
            >
              <Text variant="caption" className="text-primary">
                {I18n.t('pro.privacy_policy')}
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
            onEnable();
          }}
          primaryLabel={I18n.t('onboarding.analytics.enable')}
          extraContent={
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onSkip();
              }}
              className="items-center py-2"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.not_now')}
              </Text>
            </Pressable>
          }
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  pointList: {
    gap: spacing.sm,
  },
  pointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pointIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: {
    flex: 1,
  },
});
