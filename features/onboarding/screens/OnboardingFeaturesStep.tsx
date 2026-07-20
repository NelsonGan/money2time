import { ChartPie, Nfc, ReceiptText, Users } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Mascot } from '~/components/feedback/Mascot';
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

interface OnboardingFeaturesStepProps {
  onBack: () => void;
  onFinish: () => void;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
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

export function OnboardingFeaturesStep({ onBack, onFinish }: OnboardingFeaturesStepProps) {
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < 700;
  const ICON_SIZE = isCompact ? 18 : 22;
  const mascotSize = isCompact ? 90 : 120;
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  const features = [
    {
      icon: Nfc,
      title: I18n.t('onboarding.features.autolog_title'),
      subtitle: I18n.t('onboarding.features.autolog_subtitle'),
    },
    {
      icon: ReceiptText,
      title: I18n.t('onboarding.features.receipt_title'),
      subtitle: I18n.t('onboarding.features.receipt_subtitle'),
    },
    {
      icon: Users,
      title: I18n.t('onboarding.features.split_title'),
      subtitle: I18n.t('onboarding.features.split_subtitle'),
    },
    {
      icon: ChartPie,
      title: I18n.t('onboarding.features.insights_title'),
      subtitle: I18n.t('onboarding.features.insights_subtitle'),
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
          <OnboardingStepHeader
            title={I18n.t('onboarding.features.title')}
            subtitle={I18n.t('onboarding.features.subtitle')}
          />

          <Animated.View
            entering={FadeIn.delay(150).duration(300)}
            className={isCompact ? 'mt-4' : 'mt-6'}
          >
            <View style={styles.iconContainer}>
              <Mascot size={mascotSize} name="celebrate" animate />
            </View>

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
            onBack();
          }}
          onPrimary={() => {
            void triggerHaptic('success');
            onFinish();
          }}
          primaryLabel={I18n.t('onboarding.features.start')}
        />
      </View>
    </GestureDetector>
  );
}
