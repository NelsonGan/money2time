import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CategoryEmoji, Card, Text, TimeValueInline } from '~/components/ui';
import { getThemeWordmarkPalette, spacing } from '~/constants/designSystem';
import { useResolvedTheme, useThemeColor } from '~/context/ThemeContext';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatCurrency, formatHours } from '~/utils/formatters';

const APP_ICON_SOURCE = require('../../../assets/app-icon.png');
/** iOS's squircle is close enough to this fraction of the tile for our purposes. */
const APP_ICON_RADIUS = 0.2237;

interface OnboardingValuePropStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
}

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
}: OnboardingValuePropStepProps) {
  const themeColors = useThemeColors();
  // The wordmark has its own three-colour palette, warm on the name and the
  // theme's own colour on "Time" -- the same split `assets/banner.png` draws.
  const wordmark = getThemeWordmarkPalette(useThemeColor(), useResolvedTheme());
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sym = currencySymbol;
  const trueHourlyRate = 15;

  // Compact mode for smaller screens
  const isCompact = windowHeight < 700;
  const isMedium = windowHeight >= 700 && windowHeight < 900;

  const appIconSize = isCompact ? 84 : isMedium ? 96 : 108;
  const rowVerticalPadding = isCompact ? spacing.xxs + 2 : isMedium ? spacing.sm : spacing.md;
  const cardMarginTop = isCompact ? spacing.sm : isMedium ? spacing.md : spacing.lg;
  // Keep top padding tight — the progress header already provides visual separation
  const containerPaddingTop = isCompact ? spacing.xxs : spacing.xs;

  // The same category artwork the real list uses, so the preview reads as a day
  // in the app rather than a diagram of one.
  const previewTransactions = useMemo(
    () => [
      {
        icon: 'coffee',
        title: I18n.t('onboarding.value_prop.preview_tx_coffee_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_coffee_subtitle'),
        amount: 4.5,
      },
      {
        // `ramen`, not `meal`: the plate-and-cutlery icon is pale and reads as an
        // abstract shape at 26px, where a noodle bowl is unmistakable.
        icon: 'ramen',
        title: I18n.t('onboarding.value_prop.preview_tx_lunch_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_lunch_subtitle'),
        amount: 12,
      },
      {
        icon: 'taxi',
        title: I18n.t('onboarding.value_prop.preview_tx_ride_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_ride_subtitle'),
        amount: 8.5,
      },
    ],
    [],
  );
  const totalAmount = useMemo(
    () => previewTransactions.reduce((sum, item) => sum + item.amount, 0),
    [previewTransactions],
  );
  const totalTime = formatHours(totalAmount / trueHourlyRate);

  const previewRowMarkSize = isCompact ? 36 : 42;
  const previewRowIconSize = isCompact ? 22 : 26;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
            paddingTop: containerPaddingTop,
            paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
          },
        ]}
      >
        <OnboardingStepHeader compact>
          <View style={styles.brand}>
            {/* The launcher icon, so the first screen shows the same tile the
                user just tapped. It carries its own cream backdrop, which sits
                close to the page behind it, hence the hairline edge. */}
            <Image
              source={APP_ICON_SOURCE}
              style={{
                width: appIconSize,
                height: appIconSize,
                borderRadius: appIconSize * APP_ICON_RADIUS,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: themeColors.border,
              }}
              contentFit="cover"
              accessible
              accessibilityRole="image"
              accessibilityLabel={I18n.t('app.name')}
            />
            {/* Split the way the banner splits it. `app.name` is the same brand
                string in all 23 locales, so this never has to translate. */}
            <Text variant="title" className="text-center" accessibilityLabel={I18n.t('app.name')}>
              <Text variant="title" style={{ color: wordmark.money }}>
                Money
              </Text>
              <Text variant="title" style={{ color: wordmark.two }}>
                2
              </Text>
              <Text variant="title" style={{ color: wordmark.time }}>
                Time
              </Text>
            </Text>
          </View>
        </OnboardingStepHeader>

        <Animated.View
          entering={FadeIn.delay(150).duration(300)}
          style={[styles.cardWrapper, { marginTop: cardMarginTop }]}
        >
          {/* One card, no boxes inside it. The hero and the rows used to sit in
              their own bordered panels, which put two more frames inside a frame
              the page had already drawn; hairlines separate them now. */}
          <Card variant="accent" className={isCompact ? 'p-4' : undefined}>
            <View style={styles.previewHeaderRow}>
              <Text variant="caption" tone="muted">
                {I18n.t('onboarding.value_prop.preview_total')}
              </Text>
              <Text variant="caption" tone="muted">
                {I18n.t('onboarding.value_prop.example_rate', { symbol: sym })}
              </Text>
            </View>

            <View style={styles.previewHeroValues} className="mt-2">
              <View>
                <Text
                  variant={isCompact ? 'heading' : 'display'}
                  className="text-foreground tracking-tight"
                >
                  {formatCurrency(totalAmount, sym)}
                </Text>
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('onboarding.value_prop.money_mode')}
                </Text>
              </View>
              <View className="items-end">
                <TimeValueInline
                  value={totalTime}
                  variant={isCompact ? 'subheading' : 'heading'}
                  textClassName="text-primary"
                  iconColor={themeColors.primary}
                  iconSize={isCompact ? 12 : 14}
                />
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('onboarding.value_prop.time_mode')}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.previewDivider,
                {
                  backgroundColor: `${themeColors.border}55`,
                  marginTop: isCompact ? spacing.sm : spacing.md,
                },
              ]}
            />

            {previewTransactions.map((item, index) => (
              <React.Fragment key={item.title}>
                <View style={[styles.previewRow, { paddingVertical: rowVerticalPadding }]}>
                  <View
                    style={[
                      styles.previewRowMark,
                      {
                        backgroundColor: themeColors.surfaceMuted,
                        width: previewRowMarkSize,
                        height: previewRowMarkSize,
                      },
                    ]}
                  >
                    <CategoryEmoji icon={item.icon} size={previewRowIconSize} />
                  </View>
                  <View className="flex-1">
                    <Text variant="bodyStrong" className="text-foreground">
                      {item.title}
                    </Text>
                    {!isCompact ? (
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.previewRowValues}>
                    <Text variant="bodyStrong" className="text-foreground">
                      {formatCurrency(item.amount, sym)}
                    </Text>
                    <TimeValueInline
                      value={formatHours(item.amount / trueHourlyRate)}
                      variant="caption"
                      containerClassName="mt-0.5"
                      textClassName="text-primary"
                      iconColor={themeColors.primary}
                      iconSize={10}
                    />
                  </View>
                </View>
                {index < previewTransactions.length - 1 ? (
                  <View
                    style={[styles.previewDivider, { backgroundColor: `${themeColors.border}33` }]}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </Card>
        </Animated.View>
      </View>

      <OnboardingActionBar
        onPrimary={() => {
          void triggerHaptic('medium');
          onGetStarted();
        }}
        primaryLabel={I18n.t('common.continue')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewHeroValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
  },
  previewRowMark: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRowValues: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  cardWrapper: {
    flex: 1,
    // The card hugs its content now that the inner panels are gone, so it is
    // centred in what is left rather than left hanging under the wordmark.
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
