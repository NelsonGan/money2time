import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { CategoryEmoji, Text, TimeValueInline } from '~/components/ui';
import { TIME_VALUE_ICON } from '~/components/ui/time-value-inline';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { ONBOARDING_CARD } from '~/features/onboarding/constants/styles';
import { exampleHourlyRate, sampleAmountForHours } from '~/features/onboarding/lib/onboardingMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatCurrency, formatHours } from '~/utils/formatters';

const BOOK_COVER = require('~/assets/illustrations/book-your-money-or-your-life.webp');
/** A title and its authors, not copy: the same in every language. */
const BOOK_TITLE = 'Your Money or Your Life';
const BOOK_AUTHORS = 'Vicki Robin & Joe Dominguez';

/**
 * Small to large, so the hours grow down the card. Each is priced from the
 * example hourly rate of the user's currency (at RM15/hr: RM4.50, RM45 and
 * RM1,200), so the prices look right in any currency.
 */
const EXAMPLES = [
  { key: 'onboarding.welcome.coffee', icon: 'coffee', hours: 0.3 },
  { key: 'onboarding.welcome.sneakers', icon: 'sneaker', hours: 3 },
  { key: 'onboarding.welcome.phone', icon: 'smartphone', hours: 80 },
] as const;

interface OnboardingWelcomeStepProps {
  currencyCode: string;
  currencySymbol: string;
  onGetStarted: () => void;
}

/**
 * The first page says what the app is: every price, also shown as the hours
 * of work it costs. It uses the same frame as every other step.
 */
export function OnboardingWelcomeStep({
  currencyCode,
  currencySymbol,
  onGetStarted,
}: OnboardingWelcomeStepProps) {
  const themeColors = useThemeColors();
  // "RM15", not "RM15.00": a round rate reads as a rule of thumb.
  const rate = exampleHourlyRate(currencyCode);
  const examples = EXAMPLES.map((example) => ({
    ...example,
    amount: sampleAmountForHours(example.hours, rate),
  }));
  const rateLabel = formatCurrency(rate, currencySymbol).replace(/\.00$/, '');
  const rateKey = I18n.t('onboarding.welcome.rate_key', { rate: rateLabel });

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
      {/* The rate sits on the card's top edge as its key: it is what turns
          each price below into hours. */}
      <View className="pt-4">
        <View className={`px-4 pb-1 pt-4 ${ONBOARDING_CARD}`}>
          {examples.map((example, index) => (
            <View
              key={example.key}
              className={cn(
                'flex-row items-center gap-3 py-3',
                index < examples.length - 1 && 'border-b border-border/25',
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
                  value={formatHours(example.amount / rate)}
                  variant="bodyStrong"
                  textClassName="text-primary"
                  iconColor={themeColors.primary}
                  iconSize={13}
                />
              </View>
            </View>
          ))}
        </View>
        <View
          className="absolute left-0 right-0 top-0 items-center"
          accessible
          accessibilityLabel={rateKey}
        >
          <View className="rounded-full bg-background">
            <View className="flex-row items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5">
              <TIME_VALUE_ICON size={14} color={themeColors.primary} strokeWidth={2.4} />
              <Text variant="caption" tone="primary" className="text-[14px]">
                {rateKey}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Where the idea comes from: the book that counts money in "life
          energy", the hours a price costs you. */}
      <View
        className="mt-8 flex-row items-center gap-3 self-center"
        accessible
        accessibilityLabel={`${I18n.t('onboarding.welcome.inspired_by', { book: BOOK_TITLE })}, ${BOOK_AUTHORS}`}
      >
        <Image
          source={BOOK_COVER}
          style={{ width: 30, height: 47, borderRadius: 3 }}
          contentFit="cover"
          accessible={false}
        />
        <View>
          <Text variant="caption" tone="muted">
            {I18n.t('onboarding.welcome.inspired_by', { book: BOOK_TITLE })}
          </Text>
          <Text variant="caption" tone="muted" className="font-normal opacity-80">
            {BOOK_AUTHORS}
          </Text>
        </View>
      </View>
    </OnboardingStepLayout>
  );
}
