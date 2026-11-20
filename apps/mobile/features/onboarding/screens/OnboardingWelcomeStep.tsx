import React from 'react';
import { View } from 'react-native';

import { CategoryEmoji, Text, TimeValueInline } from '~/components/ui';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { ONBOARDING_CARD } from '~/features/onboarding/constants/styles';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatCurrency, formatHours } from '~/utils/formatters';

/** The examples on the first page are priced at this hourly rate. */
const EXAMPLE_RATE = 15;

/** Small to large, so the hours grow down the card. */
const EXAMPLES = [
  { key: 'onboarding.try_it.coffee', icon: 'coffee', amount: 4.5 },
  { key: 'onboarding.welcome.sneakers', icon: 'sneaker', amount: 45 },
  { key: 'onboarding.welcome.phone', icon: 'smartphone', amount: 1200 },
] as const;

interface OnboardingWelcomeStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
}

/**
 * The first page says what the app is: every price, also shown as the hours
 * of work it costs. It uses the same frame as every other step.
 */
export function OnboardingWelcomeStep({
  currencySymbol,
  onGetStarted,
}: OnboardingWelcomeStepProps) {
  const themeColors = useThemeColors();

  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.welcome.title')}
      subtitle={I18n.t('onboarding.welcome.subtitle')}
      mascot="happy"
      primaryLabel={I18n.t('onboarding.welcome.get_started')}
      onPrimary={() => {
        void triggerHaptic('medium');
        onGetStarted();
      }}
    >
      <View className={`px-4 py-1 ${ONBOARDING_CARD}`}>
        {EXAMPLES.map((example, index) => (
          <View
            key={example.key}
            className={cn(
              'flex-row items-center gap-3 py-3',
              index < EXAMPLES.length - 1 && 'border-b border-border/25',
            )}
          >
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-secondary/60">
              <CategoryEmoji icon={example.icon} size={26} />
            </View>
            <Text variant="bodyStrong" className="flex-1 text-foreground">
              {I18n.t(example.key)}
            </Text>
            <View className="items-end">
              <Text variant="bodyStrong" className="text-foreground">
                {formatCurrency(example.amount, currencySymbol)}
              </Text>
              <TimeValueInline
                value={formatHours(example.amount / EXAMPLE_RATE)}
                variant="bodyStrong"
                textClassName="text-primary"
                iconColor={themeColors.primary}
                iconSize={13}
              />
            </View>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="muted" className="mt-3 text-center">
        {I18n.t('onboarding.try_it.example_rate', {
          rate: formatCurrency(EXAMPLE_RATE, currencySymbol),
        })}
      </Text>
    </OnboardingStepLayout>
  );
}
