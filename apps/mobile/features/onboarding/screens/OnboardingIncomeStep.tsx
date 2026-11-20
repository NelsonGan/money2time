import React from 'react';

import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { WageForm } from '~/features/settings/components/WageForm';
import { hasHourlyRate } from '~/features/settings/lib/wageMonths';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { WageConfig } from '~/types';

interface OnboardingIncomeStepProps {
  config: WageConfig;
  currencySymbol: string;
  onChange: (config: WageConfig) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Pay, hours and the hourly value they make, on one page; commute and other
 * unpaid time open in place on the same page for those who want them.
 */
export function OnboardingIncomeStep({
  config,
  currencySymbol,
  onChange,
  onBack,
  onContinue,
  onSkip,
}: OnboardingIncomeStepProps) {
  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.income.title')}
      subtitle={I18n.t('onboarding.income.subtitle')}
      mascot="thinking"
      onBack={onBack}
      revealBelowOnKeyboard
      primaryLabel={I18n.t('common.continue')}
      primaryDisabled={!hasHourlyRate(config)}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue();
      }}
      secondary={{
        label: I18n.t('onboarding.income.skip'),
        onPress: () => {
          void triggerHaptic('selection');
          onSkip();
        },
      }}
    >
      <WageForm config={config} currencySymbol={currencySymbol} onChange={onChange} />
    </OnboardingStepLayout>
  );
}
