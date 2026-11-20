import React from 'react';
import { Alert, Platform } from 'react-native';

import { OnboardingFeatureListStep } from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const AUTOMATIC = require('~/assets/illustrations/onboarding-backup-auto.webp');
const PRIVATE = require('~/assets/illustrations/onboarding-backup-private.webp');
const RESTORE = require('~/assets/illustrations/onboarding-backup-restore.webp');

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
      image: AUTOMATIC,
      title: I18n.t('onboarding.backup.automatic_title'),
      subtitle: I18n.t('onboarding.backup.automatic_subtitle', { provider }),
    },
    {
      image: PRIVATE,
      title: I18n.t('onboarding.backup.private_title'),
      subtitle: I18n.t('onboarding.backup.private_subtitle'),
    },
    {
      image: RESTORE,
      title: I18n.t('onboarding.backup.restore_title'),
      subtitle: I18n.t('onboarding.backup.restore_subtitle'),
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
      subtitle={I18n.t('onboarding.backup.subtitle')}
      mascot="relaxing"
      features={features}
      onBack={onBack}
      primaryLabel={I18n.t(
        isIos ? 'onboarding.backup.enable_icloud' : 'onboarding.backup.enable_google',
      )}
      onPrimary={handleEnable}
      secondary={{ label: I18n.t('onboarding.backup.not_now'), onPress: handleSkip }}
    />
  );
}
