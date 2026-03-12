import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Card, CardContent, SelectField, Text } from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getLocaleLabel, I18n, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingPreferencesStepProps {
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  onLocaleChange: (locale: string) => void;
  onCurrencyChange: (currency: { code: string; symbol: string }) => void;
  onBack: () => void;
  onContinue: () => void;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
});

export function OnboardingPreferencesStep({
  locale,
  currencyCode,
  currencySymbol,
  onLocaleChange,
  onCurrencyChange,
  onBack,
  onContinue,
}: OnboardingPreferencesStepProps) {
  const themeColors = useThemeColors();
  const languageOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((item) => ({
        value: item,
        label: `${getLocaleLabel(item)} (${item})`,
      })),
    [],
  );
  const currencyOptions = useMemo(
    () =>
      MAJOR_CURRENCIES.map((item) => ({
        value: item.code,
        label: `${item.code} (${item.symbol}) · ${item.name}`,
      })),
    [],
  );
  const currencyByCode = useMemo(
    () => new Map(MAJOR_CURRENCIES.map((item) => [item.code, item])),
    [],
  );
  const currencyBySymbol = useMemo(() => {
    const bySymbol = new Map<string, (typeof MAJOR_CURRENCIES)[number]>();
    MAJOR_CURRENCIES.forEach((item) => {
      if (bySymbol.has(item.symbol)) return;
      bySymbol.set(item.symbol, item);
    });
    return bySymbol;
  }, []);
  const selectedLocale = SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])
    ? locale
    : 'en';
  const currentCurrencyCode = currencyByCode.has(currencyCode)
    ? currencyCode
    : (currencyBySymbol.get(currencySymbol)?.code ?? 'USD');
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(500).springify().damping(16)}
            className="mt-8 px-2"
          >
            <Text variant="label" tone="primary" className="text-center tracking-widest">
              {I18n.t('onboarding.progress_step_of', { step: 2, total: 5 })}
            </Text>
            <Text variant="title" className="text-center mt-2 text-foreground">
              {I18n.t('onboarding.value_prop.language_label')} &{' '}
              {I18n.t('onboarding.value_prop.currency_label')}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(300).duration(350)} className="mt-8">
            <Card variant="default" className="border border-border/25 overflow-hidden">
              {/* Decorative blob */}
              <View
                className="absolute -top-8 -right-8 h-24 w-24 rounded-full"
                style={{ backgroundColor: themeColors.primary, opacity: 0.04 }}
              />

              <CardContent className="py-5 gap-4">
                <SelectField
                  label={I18n.t('onboarding.value_prop.language_label')}
                  value={selectedLocale}
                  options={languageOptions}
                  onChange={(value) => onLocaleChange(value)}
                />
                <SelectField
                  label={I18n.t('onboarding.value_prop.currency_label')}
                  value={currentCurrencyCode}
                  options={currencyOptions}
                  onChange={(value) => {
                    const found = currencyByCode.get(value);
                    if (found) onCurrencyChange({ code: found.code, symbol: found.symbol });
                  }}
                />
                <Text variant="caption" tone="muted">
                  {I18n.t('onboarding.value_prop.prefill_note')}
                </Text>
              </CardContent>
            </Card>
          </Animated.View>
        </ScrollView>

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onBack();
          }}
          onPrimary={() => {
            void triggerHaptic('medium');
            onContinue();
          }}
          primaryLabel={I18n.t('common.continue')}
        />
      </View>
    </GestureDetector>
  );
}
