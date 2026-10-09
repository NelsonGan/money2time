import { ChartPie, Nfc, ReceiptText, Users } from 'lucide-react-native';
import React from 'react';

import { OnboardingFeatureListStep } from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingFeaturesStepProps {
  onBack: () => void;
  onFinish: () => void;
}

export function OnboardingFeaturesStep({ onBack, onFinish }: OnboardingFeaturesStepProps) {
  return (
    <OnboardingFeatureListStep
      title={I18n.t('onboarding.features.title')}
      mascot="thumbs-up"
      features={[
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
      ]}
      onBack={onBack}
      primaryLabel={I18n.t('onboarding.features.start')}
      onPrimary={() => {
        void triggerHaptic('success');
        onFinish();
      }}
    />
  );
}
