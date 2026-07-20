import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text, TimeValueInline } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
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

const BANNER_SOURCE = require('../../../assets/banner.png');
const BANNER_ASPECT = 2120 / 742;

interface OnboardingValuePropStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
}

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
}: OnboardingValuePropStepProps) {
  const themeColors = useThemeColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sym = currencySymbol;
  const trueHourlyRate = 15;

  // Compact mode for smaller screens
  const isCompact = windowHeight < 700;
  const isMedium = windowHeight >= 700 && windowHeight < 900;

  const bannerWidth = Math.min(windowWidth * 0.66, isCompact ? 230 : 270);
  const heroVerticalPadding = isCompact ? spacing.sm : isMedium ? spacing.md : spacing.lg;
  const rowVerticalPadding = isCompact ? spacing.xxs + 2 : isMedium ? spacing.sm : spacing.md;
  const cardMarginTop = isCompact ? spacing.sm : isMedium ? spacing.md : spacing.lg;
  // Keep top padding tight — the progress header already provides visual separation
  const containerPaddingTop = isCompact ? spacing.xxs : spacing.xs;

  const previewTransactions = useMemo(
    () => [
      {
        title: I18n.t('onboarding.value_prop.preview_tx_coffee_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_coffee_subtitle'),
        amount: 4.5,
        color: themeColors.primary,
      },
      {
        title: I18n.t('onboarding.value_prop.preview_tx_lunch_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_lunch_subtitle'),
        amount: 12,
        color: themeColors.accent,
      },
      {
        title: I18n.t('onboarding.value_prop.preview_tx_ride_title'),
        subtitle: I18n.t('onboarding.value_prop.preview_tx_ride_subtitle'),
        amount: 8.5,
        color: themeColors.coral,
      },
    ],
    [themeColors.accent, themeColors.coral, themeColors.primary],
  );
  const totalAmount = useMemo(
    () => previewTransactions.reduce((sum, item) => sum + item.amount, 0),
    [previewTransactions],
  );
  const totalTime = formatHours(totalAmount / trueHourlyRate);

  const previewRowMarkSize = isCompact ? 36 : 42;
  const previewRowDotSize = isCompact ? 10 : 12;

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
          <Image
            source={BANNER_SOURCE}
            style={{ width: bannerWidth, height: bannerWidth / BANNER_ASPECT }}
            contentFit="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={I18n.t('app.name')}
          />
        </OnboardingStepHeader>

        <Animated.View
          entering={FadeIn.delay(150).duration(300)}
          style={[styles.cardWrapper, { marginTop: cardMarginTop }]}
        >
          <Card variant="accent" className={isCompact ? 'p-3' : isMedium ? 'p-4' : undefined}>
            <CardContent>
              <View style={styles.previewHeaderRow}>
                <View
                  style={[
                    styles.previewBadge,
                    {
                      backgroundColor: `${themeColors.primary}10`,
                      borderColor: `${themeColors.primary}24`,
                    },
                  ]}
                >
                  <Text variant="caption" tone="primary">
                    {I18n.t('onboarding.value_prop.preview_day')}
                  </Text>
                </View>
                <Text variant="caption" tone="muted">
                  {I18n.t('onboarding.value_prop.example_rate', { symbol: sym })}
                </Text>
              </View>

              <View
                style={[
                  styles.previewHero,
                  {
                    backgroundColor: `${themeColors.surface}E8`,
                    borderColor: `${themeColors.border}45`,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: heroVerticalPadding,
                    marginTop: isCompact ? spacing.xs : spacing.md,
                  },
                ]}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('onboarding.value_prop.preview_total')}
                </Text>
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
              </View>

              <View
                style={[
                  styles.previewList,
                  {
                    backgroundColor: `${themeColors.card}F4`,
                    borderColor: `${themeColors.border}40`,
                    marginTop: isCompact ? spacing.xs : spacing.md,
                  },
                ]}
              >
                {previewTransactions.map((item, index) => (
                  <React.Fragment key={item.title}>
                    <View
                      style={[
                        styles.previewRow,
                        { paddingHorizontal: spacing.lg, paddingVertical: rowVerticalPadding },
                      ]}
                    >
                      <View
                        style={[
                          styles.previewRowMark,
                          {
                            backgroundColor: `${item.color}16`,
                            width: previewRowMarkSize,
                            height: previewRowMarkSize,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.previewRowDot,
                            {
                              backgroundColor: item.color,
                              width: previewRowDotSize,
                              height: previewRowDotSize,
                            },
                          ]}
                        />
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
                          style={{ color: item.color }}
                          iconColor={item.color}
                          iconSize={10}
                        />
                      </View>
                    </View>
                    {index < previewTransactions.length - 1 ? (
                      <View
                        style={[
                          styles.previewRowDivider,
                          { backgroundColor: `${themeColors.border}32` },
                        ]}
                      />
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
            </CardContent>
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
  previewBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  previewHero: {
    borderRadius: 24,
    borderWidth: 1,
  },
  previewHeroValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  previewList: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewRowDivider: {
    height: 1,
    marginLeft: spacing.lg * 2 + spacing.md,
    marginRight: spacing.lg,
  },
  previewRowMark: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRowDot: {
    borderRadius: 999,
  },
  previewRowValues: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  cardWrapper: {
    flex: 1,
  },
});
