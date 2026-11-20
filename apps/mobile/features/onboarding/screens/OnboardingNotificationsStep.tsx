import { CalendarCheck, RefreshCw, TrendingUp } from 'lucide-react-native';
import React from 'react';

import { OnboardingFeatureListStep } from '~/features/onboarding/components/OnboardingFeatureListStep';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

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
      mascot="excited"
      features={[
        {
          icon: CalendarCheck,
          title: I18n.t('onboarding.notifications.daily_title'),
          subtitle: I18n.t('onboarding.notifications.daily_subtitle'),
        },
        {
          icon: RefreshCw,
          title: I18n.t('onboarding.notifications.recurring_title'),
          subtitle: I18n.t('onboarding.notifications.recurring_subtitle'),
        },
        {
          icon: TrendingUp,
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
