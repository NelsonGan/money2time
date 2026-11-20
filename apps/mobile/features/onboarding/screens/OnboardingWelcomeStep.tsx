import { Image } from 'expo-image';
import { ArrowDown } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Mascot } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';
import { getThemeWordmarkPalette } from '~/constants/designSystem';
import { useResolvedTheme, useThemeColor } from '~/context/ThemeContext';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatCurrency, formatHours } from '~/utils/formatters';

const SNEAKER = require('~/assets/illustrations/onboarding-sneaker.webp');

/** The example on the first page: a 45 sneaker at 15 an hour is 3 hours. */
const EXAMPLE_PRICE = 45;
const EXAMPLE_RATE = 15;

interface OnboardingWelcomeStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
}

/**
 * The first page says what the app is in one picture: a price, and the hours
 * of work it costs.
 */
export function OnboardingWelcomeStep({
  currencySymbol,
  onGetStarted,
}: OnboardingWelcomeStepProps) {
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const wordmark = getThemeWordmarkPalette(useThemeColor(), resolvedTheme);
  const { height } = useWindowDimensions();
  const compact = height < 760;

  const price = formatCurrency(EXAMPLE_PRICE, currencySymbol);
  const time = formatHours(EXAMPLE_PRICE / EXAMPLE_RATE);
  const mascotSize = compact ? 92 : 116;
  const sneakerSize = compact ? 120 : 160;

  return (
    <View className="flex-1">
      <View className="flex-1 px-5">
        {/* `app.name` is the same brand string in every locale. */}
        <Text
          variant="subheading"
          className="pt-3"
          accessibilityRole="header"
          accessibilityLabel={I18n.t('app.name')}
        >
          <Text variant="subheading" style={{ color: wordmark.money }}>
            Money
          </Text>
          <Text variant="subheading" style={{ color: wordmark.two }}>
            2
          </Text>
          <Text variant="subheading" style={{ color: wordmark.time }}>
            Time
          </Text>
        </Text>

        <View className="flex-1 justify-center">
          <Animated.View
            entering={FadeIn.duration(320)}
            style={{ paddingTop: mascotSize * 0.55 }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={I18n.t('onboarding.welcome.hero_a11y', { amount: price, time })}
          >
            <View className="items-center rounded-[28px] border border-border/40 bg-card px-6 pb-6 pt-8">
              <Image
                source={SNEAKER}
                style={{ width: sneakerSize, height: sneakerSize * 0.8 }}
                contentFit="contain"
                accessible={false}
              />
              <Text variant="display" className="mt-2 text-foreground">
                {price}
              </Text>
              <Animated.View
                entering={FadeInDown.delay(350).duration(300)}
                className="items-center"
              >
                <ArrowDown size={22} color={themeColors.primary} strokeWidth={2.4} />
                <Text variant="display" tone="primary" className="mt-1 text-center">
                  {time} {I18n.t('onboarding.welcome.of_work')}
                </Text>
              </Animated.View>
            </View>
            <View className="absolute left-2 top-0">
              <Mascot size={mascotSize} name="happy" animate={false} />
            </View>
          </Animated.View>
        </View>

        <View className={compact ? 'pb-2 pt-4' : 'pb-4 pt-8'}>
          <Text variant="title" className="text-foreground">
            {I18n.t('onboarding.welcome.title')}
          </Text>
          <Text variant="friendly" tone="muted" className="mt-2">
            {I18n.t('onboarding.welcome.subtitle')}
          </Text>
        </View>
      </View>

      <OnboardingActionBar
        onPrimary={() => {
          void triggerHaptic('medium');
          onGetStarted();
        }}
        primaryLabel={I18n.t('onboarding.welcome.get_started')}
      />
    </View>
  );
}
