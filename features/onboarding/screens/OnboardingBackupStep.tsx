import { CloudUpload, RotateCcw, WifiOff } from 'lucide-react-native';
import React from 'react';
import { Alert, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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

interface OnboardingBackupStepProps {
  onEnable: () => void;
  onSkip: () => void;
}

export function OnboardingBackupStep({ onEnable, onSkip }: OnboardingBackupStepProps) {
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < 700;
  const ICON_SIZE = isCompact ? 18 : 22;

  const isIos = Platform.OS === 'ios';
  const provider = isIos
    ? I18n.t('onboarding.backup.provider_icloud')
    : I18n.t('onboarding.backup.provider_google');

  const features = [
    {
      icon: WifiOff,
      title: I18n.t('onboarding.backup.bullet_offline_title'),
      subtitle: I18n.t('onboarding.backup.bullet_offline_subtitle'),
    },
    {
      icon: CloudUpload,
      title: I18n.t('onboarding.backup.bullet_automatic_title'),
      subtitle: I18n.t('onboarding.backup.bullet_automatic_subtitle', { provider }),
    },
    {
      icon: RotateCcw,
      title: I18n.t('onboarding.backup.bullet_restore_title'),
      subtitle: I18n.t('onboarding.backup.bullet_restore_subtitle'),
    },
  ];

  const handleEnable = () => {
    void triggerHaptic('medium');
    onEnable();
  };

  // Losing the phone means losing everything, since data is device-local. Make
  // the user confirm they understand that before we let them walk past backup.
  const handleSkip = () => {
    void triggerHaptic('selection');
    Alert.alert(
      I18n.t('onboarding.backup.confirm_title'),
      I18n.t('onboarding.backup.confirm_message', { provider }),
      [
        {
          text: I18n.t('onboarding.backup.confirm_enable'),
          style: 'default',
          onPress: handleEnable,
        },
        {
          text: I18n.t('onboarding.backup.confirm_skip'),
          style: 'destructive',
          onPress: () => {
            void triggerHaptic('selection');
            onSkip();
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingStepHeader title={I18n.t('onboarding.backup.title')} mascot="announce" />

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
        onBack={handleSkip}
        onPrimary={handleEnable}
        backLabel={I18n.t('onboarding.backup.not_now')}
        primaryLabel={I18n.t(
          isIos ? 'onboarding.backup.enable_icloud' : 'onboarding.backup.enable_google',
        )}
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
