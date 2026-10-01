import { CloudUpload, RotateCcw, WifiOff } from 'lucide-react-native';
import React from 'react';
import { Alert, Platform } from 'react-native';

import { OnboardingFeatureListStep } from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingBackupStepProps {
  onEnable: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function OnboardingBackupStep({ onEnable, onSkip, onBack }: OnboardingBackupStepProps) {
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
    <OnboardingFeatureListStep
      title={I18n.t('onboarding.backup.title')}
      mascot="phone-check"
      features={features}
      onBack={onBack}
      primaryLabel={I18n.t(
        isIos ? 'onboarding.backup.enable_icloud' : 'onboarding.backup.enable_google',
      )}
      onPrimary={handleEnable}
      skip={{ label: I18n.t('onboarding.backup.not_now'), onPress: handleSkip }}
    />
  );
}
