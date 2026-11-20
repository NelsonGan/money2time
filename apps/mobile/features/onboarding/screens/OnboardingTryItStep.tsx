import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { CategoryEmoji, Text, TimeValueInline } from '~/components/ui';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { sampleAmountForHours } from '~/features/onboarding/lib/onboardingMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatCurrency, formatHours } from '~/utils/formatters';

/** The rate the samples use when the user skipped the income step. */
const EXAMPLE_RATE = 15;

/** Each sample costs about this many hours of the user's own pay. */
const SAMPLES = [
  { id: 'coffee', icon: 'coffee', hours: 0.25 },
  { id: 'lunch', icon: 'ramen', hours: 0.6 },
  { id: 'taxi', icon: 'taxi', hours: 0.9 },
  { id: 'movie', icon: 'cinema', hours: 1.2 },
  { id: 'groceries', icon: 'grocery-basket', hours: 3 },
] as const;

type SampleId = (typeof SAMPLES)[number]['id'];

interface OnboardingTryItStepProps {
  /** The user's true hourly rate, 0 when they skipped setting it. */
  hourlyRate: number;
  currencySymbol: string;
  onBack: () => void;
  onContinue: (samplesAdded: number) => void;
}

/**
 * A practice run of the core loop: tap an expense, see it land in today's list
 * with what it cost in time. Nothing here is saved.
 */
export function OnboardingTryItStep({
  hourlyRate,
  currencySymbol,
  onBack,
  onContinue,
}: OnboardingTryItStepProps) {
  const themeColors = useThemeColors();
  const [added, setAdded] = useState<SampleId[]>([]);
  const rate = hourlyRate > 0 ? hourlyRate : EXAMPLE_RATE;

  const samples = useMemo(
    () =>
      SAMPLES.map((sample) => ({
        ...sample,
        label: I18n.t(`onboarding.try_it.${sample.id}`),
        amount: sampleAmountForHours(sample.hours, rate),
      })),
    [rate],
  );
  const byId = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples]);
  const rows = added.map((id) => byId.get(id)).filter((row) => row !== undefined);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  const toggle = (id: SampleId) => {
    void triggerHaptic(added.includes(id) ? 'selection' : 'light');
    setAdded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.try_it.title')}
      subtitle={I18n.t('onboarding.try_it.subtitle')}
      mascot="writing"
      onBack={onBack}
      primaryLabel={I18n.t('common.continue')}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue(added.length);
      }}
    >
      <View className="flex-row flex-wrap gap-2">
        {samples.map((sample) => {
          const selected = added.includes(sample.id);
          return (
            <Pressable
              key={sample.id}
              onPress={() => toggle(sample.id)}
              className={cn(
                'flex-row items-center gap-2 rounded-full border px-3 py-2',
                selected ? 'border-primary/60 bg-primary/10' : 'border-border/40 bg-card',
              )}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <CategoryEmoji icon={sample.icon} size={22} />
              <Text variant="caption" className="text-[14px] text-foreground">
                {sample.label} {formatCurrency(sample.amount, currencySymbol)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        layout={LinearTransition.duration(220)}
        className="mt-5 rounded-[22px] border border-border/40 bg-card px-4 pb-2 pt-4"
      >
        <Text variant="bodyStrong" className="text-foreground">
          {I18n.t('onboarding.try_it.today')}
        </Text>

        {rows.length === 0 ? (
          <Animated.View entering={FadeIn} className="items-center py-6">
            <Text variant="caption" tone="muted">
              {I18n.t('onboarding.try_it.empty')}
            </Text>
          </Animated.View>
        ) : (
          rows.map((row) => (
            <Animated.View
              key={row.id}
              entering={FadeInDown.duration(220)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.duration(220)}
              className="flex-row items-center gap-3 border-b border-border/25 py-3"
            >
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-secondary/60">
                <CategoryEmoji icon={row.icon} size={26} />
              </View>
              <Text variant="bodyStrong" className="flex-1 text-foreground">
                {row.label}
              </Text>
              <View className="items-end">
                <Text variant="bodyStrong" className="text-foreground">
                  {formatCurrency(row.amount, currencySymbol)}
                </Text>
                <TimeValueInline
                  value={formatHours(row.amount / rate)}
                  variant="caption"
                  textClassName="text-primary"
                  iconColor={themeColors.primary}
                  iconSize={10}
                />
              </View>
            </Animated.View>
          ))
        )}

        {rows.length > 0 ? (
          <Animated.View
            entering={FadeIn}
            layout={LinearTransition.duration(220)}
            className="flex-row items-center justify-between py-3"
          >
            <Text variant="bodyStrong" className="text-foreground">
              {I18n.t('onboarding.try_it.total')} {formatCurrency(total, currencySymbol)}
            </Text>
            <TimeValueInline
              value={`${formatHours(total / rate)} ${I18n.t('onboarding.welcome.of_work')}`}
              variant="bodyStrong"
              textClassName="text-primary"
              iconColor={themeColors.primary}
              iconSize={13}
            />
          </Animated.View>
        ) : null}
      </Animated.View>

      {hourlyRate > 0 ? null : (
        <Text variant="caption" tone="muted" className="mt-3 text-center">
          {I18n.t('onboarding.try_it.example_rate', {
            rate: formatCurrency(EXAMPLE_RATE, currencySymbol),
          })}
        </Text>
      )}
    </OnboardingStepLayout>
  );
}
