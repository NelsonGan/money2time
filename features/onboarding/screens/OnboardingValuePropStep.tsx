import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { formatCurrency, formatHours } from '~/utils/formatters';

interface OnboardingValuePropStepProps {
  currencySymbol: string;
  onGetStarted: () => void;
  onSkip: () => void;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
  },
  wordmarkMoney: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  wordmarkTwo: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
    marginLeft: 1,
    transform: [{ translateY: 8 }],
  },
  wordmarkTime: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.1,
    marginLeft: -1,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
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
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  previewRowDivider: {
    height: 1,
    marginLeft: spacing.lg * 2 + spacing.md,
    marginRight: spacing.lg,
  },
  previewRowMark: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRowDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  previewRowValues: {
    alignItems: 'flex-end',
    minWidth: 92,
  },
});

export function OnboardingValuePropStep({
  currencySymbol,
  onGetStarted,
  onSkip,
}: OnboardingValuePropStepProps) {
  const themeColors = useThemeColors();
  const resolvedTheme = useResolvedTheme();
  const themeColor = useThemeColor();
  const sym = currencySymbol;
  const trueHourlyRate = 15;
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

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingStepHeader subtitle={I18n.t('onboarding.value_prop.body')}>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={I18n.t('app.name')}
            style={styles.wordmarkRow}
          >
            <Text style={[styles.wordmarkMoney, { color: wordmarkPalette.money }]}>Money</Text>
            <Text style={[styles.wordmarkTwo, { color: wordmarkPalette.two }]}>2</Text>
            <Text style={[styles.wordmarkTime, { color: wordmarkPalette.time }]}>Time</Text>
          </View>
        </OnboardingStepHeader>

        <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8">
          <Card variant="accent">
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
                  },
                ]}
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('onboarding.value_prop.preview_total')}
                </Text>
                <View style={styles.previewHeroValues} className="mt-3">
                  <View>
                    <Text variant="display" className="text-foreground tracking-tight">
                      {formatCurrency(totalAmount, sym)}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-2">
                      {I18n.t('onboarding.value_prop.money_mode')}
                    </Text>
                  </View>
                  <View className="items-end">
                    <TimeValueInline
                      value={totalTime}
                      variant="heading"
                      textClassName="text-primary"
                      iconColor={themeColors.primary}
                      iconSize={14}
                    />
                    <Text variant="caption" tone="muted" className="mt-2">
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
                  },
                ]}
              >
                {previewTransactions.map((item, index) => (
                  <React.Fragment key={item.title}>
                    <View style={styles.previewRow}>
                      <View style={[styles.previewRowMark, { backgroundColor: `${item.color}16` }]}>
                        <View style={[styles.previewRowDot, { backgroundColor: item.color }]} />
                      </View>
                      <View className="flex-1">
                        <Text variant="bodyStrong" className="text-foreground">
                          {item.title}
                        </Text>
                        <Text variant="caption" tone="muted" className="mt-1">
                          {item.subtitle}
                        </Text>
                      </View>
                      <View style={styles.previewRowValues}>
                        <Text variant="bodyStrong" className="text-foreground">
                          {formatCurrency(item.amount, sym)}
                        </Text>
                        <TimeValueInline
                          value={formatHours(item.amount / trueHourlyRate)}
                          variant="caption"
                          containerClassName="mt-1"
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
      </ScrollView>

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
