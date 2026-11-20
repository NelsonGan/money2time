import React from 'react';

import { OnboardingFeatureListStep } from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const DAILY = require('~/assets/illustrations/onboarding-notifications-daily.webp');
const RECURRING = require('~/assets/illustrations/onboarding-notifications-recurring.webp');
const WEEKLY = require('~/assets/illustrations/onboarding-notifications-weekly.webp');

interface OnboardingNotificationsStepProps {
  onEnable: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function OnboardingNotificationsStep({
  onEnable,
  onSkip,
  onBack,
}: OnboardingNotificationsStepProps) {
  return (
    <OnboardingFeatureListStep
      title={I18n.t('onboarding.notifications.title')}
      subtitle={I18n.t('onboarding.notifications.subtitle')}
      mascot="excited"
      features={[
        {
          image: DAILY,
          title: I18n.t('onboarding.notifications.daily_title'),
          subtitle: I18n.t('onboarding.notifications.daily_subtitle'),
        },
        {
          image: RECURRING,
          title: I18n.t('onboarding.notifications.recurring_title'),
          subtitle: I18n.t('onboarding.notifications.recurring_subtitle'),
        },
        {
          image: WEEKLY,
          title: I18n.t('onboarding.notifications.weekly_title'),
          subtitle: I18n.t('onboarding.notifications.weekly_subtitle'),
        },
      ]}
      onBack={onBack}
      primaryLabel={I18n.t('onboarding.notifications.enable')}
      onPrimary={() => {
        void triggerHaptic('medium');
        onEnable();
      }}
      secondary={{
        label: I18n.t('onboarding.notifications.not_now'),
        onPress: () => {
          void triggerHaptic('selection');
          onSkip();
        },
      }}
    />
  );
}
