import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { MascotName } from '~/components/feedback/Mascot';
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
import { triggerHaptic } from '~/services/haptics';

export interface OnboardingFeature {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

interface OnboardingFeatureListStepProps {
  title: string;
  mascot: MascotName;
  features: OnboardingFeature[];
  onBack: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  /** Adds a muted "Not now" link under the primary button. */
  skip?: { label: string; onPress: () => void };
}

/**
 * An onboarding page that pitches something as a short list of icon cards (the
 * backup, notifications and closing features steps), with the shared action bar.
 */
export function OnboardingFeatureListStep({
  title,
  mascot,
  features,
  onBack,
  primaryLabel,
  onPrimary,
  skip,
}: OnboardingFeatureListStepProps) {
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < 700;
  const iconSize = isCompact ? 18 : 22;
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader title={title} mascot={mascot} />

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
                      <feature.icon size={iconSize} color={themeColors.primary} />
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
          onPrimary={onPrimary}
          primaryLabel={primaryLabel}
          extraContent={
            skip ? (
              <Pressable
                onPress={skip.onPress}
                className="py-2 items-center"
                accessibilityRole="button"
                accessibilityLabel={skip.label}
              >
                <Text variant="caption" tone="muted">
                  {skip.label}
                </Text>
              </Pressable>
            ) : undefined
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
