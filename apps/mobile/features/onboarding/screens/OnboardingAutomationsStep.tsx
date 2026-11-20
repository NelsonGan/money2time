import React from 'react';
import { Platform } from 'react-native';

import {
  type OnboardingFeature,
  OnboardingFeatureListStep,
} from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const SCREENSHOT = require('~/assets/illustrations/onboarding-screenshot.webp');
const TAP_TO_PAY = require('~/assets/illustrations/onboarding-tap-to-pay.webp');
const ALERT = require('~/assets/illustrations/onboarding-alert.webp');

interface OnboardingAutomationsStepProps {
  onBack: () => void;
  onContinue: () => void;
}

/**
 * What can log expenses without typing on this platform. A showcase only:
 * each is set up later from Settings.
 */
export function OnboardingAutomationsStep({ onBack, onContinue }: OnboardingAutomationsStepProps) {
  const isIos = Platform.OS === 'ios';
  const features: OnboardingFeature[] = [
    {
      image: SCREENSHOT,
      title: I18n.t('onboarding.automations.screenshot_title'),
      subtitle: I18n.t(
        isIos
          ? 'onboarding.automations.screenshot_subtitle_ios'
          : 'onboarding.automations.screenshot_subtitle_android',
      ),
    },
    ...(isIos
      ? [
          {
            image: TAP_TO_PAY,
            title: I18n.t('onboarding.automations.apple_pay_title'),
            subtitle: I18n.t('onboarding.automations.apple_pay_subtitle'),
          },
        ]
      : []),
    {
      image: ALERT,
      title: I18n.t('onboarding.automations.alerts_title'),
      subtitle: I18n.t('onboarding.automations.alerts_subtitle'),
    },
  ];

  return (
    <OnboardingFeatureListStep
      title={I18n.t('onboarding.automations.title')}
      subtitle={I18n.t('onboarding.automations.subtitle')}
      mascot="phone-check"
      features={features}
      onBack={onBack}
      primaryLabel={I18n.t('common.continue')}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue();
      }}
    />
  );
}
