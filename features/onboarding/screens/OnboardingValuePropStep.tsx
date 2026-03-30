import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, Text, TimeValueInline } from '~/components/ui';
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
import { FONT } from '~/utils/fonts';
import { formatCurrency, formatHours } from '~/utils/formatters';

interface OnboardingValuePropStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
  onSkip: () => void;
}

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
  onSkip,
}: OnboardingValuePropStepProps) {
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const themeColor = useThemeColor();
  const { height: windowHeight } = useWindowDimensions();
  const sym = currencySymbol;
  const trueHourlyRate = 15;

  // Compact mode for smaller screens
  const isCompact = windowHeight < 700;
  const isMedium = windowHeight >= 700 && windowHeight < 900;

  const wordmarkFontSize = isCompact ? 26 : isMedium ? 30 : 34;
  const wordmarkLineHeight = isCompact ? 30 : isMedium ? 34 : 38;
  const wordmarkTwoFontSize = isCompact ? 14 : isMedium ? 16 : 18;
  const heroVerticalPadding = isCompact ? spacing.sm : isMedium ? spacing.md : spacing.lg;
  const rowVerticalPadding = isCompact ? spacing.xxs + 2 : isMedium ? spacing.sm : spacing.md;
  const cardMarginTop = isCompact ? spacing.sm : isMedium ? spacing.md : spacing.lg;
  // Keep top padding tight — the progress header already provides visual separation
  const containerPaddingTop = isCompact ? spacing.xxs : spacing.xs;

  const wordmarkPalette = useMemo(
    () => getThemeWordmarkPalette(themeColor, resolvedTheme),
    [resolvedTheme, themeColor],
  );
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
        <OnboardingStepHeader subtitle={I18n.t('onboarding.value_prop.body')} compact>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={I18n.t('app.name')}
            style={[styles.wordmarkRow, { minHeight: wordmarkLineHeight + 8 }]}
          >
            <Text
              style={[
                styles.wordmarkBase,
                {
                  fontSize: wordmarkFontSize,
                  lineHeight: wordmarkLineHeight,
                  color: wordmarkPalette.money,
                },
              ]}
            >
              Money
            </Text>
            <Text
              style={[
                styles.wordmarkTwo,
                {
                  fontSize: wordmarkTwoFontSize,
                  lineHeight: wordmarkTwoFontSize,
                  color: wordmarkPalette.two,
                  transform: [{ translateY: wordmarkFontSize * 0.22 }],
                },
              ]}
            >
              2
            </Text>
            <Text
              style={[
                styles.wordmarkBase,
                {
                  fontSize: wordmarkFontSize,
                  lineHeight: wordmarkLineHeight,
                  color: wordmarkPalette.time,
                  marginLeft: -1,
                },
              ]}
            >
              Time
            </Text>
          </View>
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
        onBack={() => {
          void triggerHaptic('selection');
          onSkip();
        }}
        onPrimary={() => {
          void triggerHaptic('medium');
          onGetStarted();
        }}
        backLabel={I18n.t('onboarding.value_prop.skip_setup')}
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
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmarkBase: {
    fontFamily: FONT.black,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  wordmarkTwo: {
    fontFamily: FONT.black,
    fontWeight: '900',
    marginLeft: 1,
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
