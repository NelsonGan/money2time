import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, SelectField } from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { getThemeColorSwatch, THEME_COLOR_OPTIONS } from '~/constants/designSystem';
import { useResolvedTheme } from '~/context/ThemeContext';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { getLocaleLabel, I18n, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ThemeColor } from '~/types';

interface OnboardingPreferencesStepProps {
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  themeColor: ThemeColor;
  onLocaleChange: (locale: string) => void;
  onCurrencyChange: (currency: { code: string; symbol: string }) => void;
  onThemeColorChange: (themeColor: ThemeColor) => void;
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
  themeColor,
  onLocaleChange,
  onCurrencyChange,
  onThemeColorChange,
  onBack,
  onContinue,
}: OnboardingPreferencesStepProps) {
  const resolvedTheme = useResolvedTheme();
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
  const themeColorOptions = useMemo(
    () =>
      THEME_COLOR_OPTIONS.map((value) => ({
        value,
        label: I18n.t(`settings.theme_color_${value}`),
        icon: (
          <View
            className="h-3.5 w-3.5 rounded-full"
            style={{ backgroundColor: getThemeColorSwatch(value, resolvedTheme) }}
          />
        ),
      })),
    [locale, resolvedTheme],
  );
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
          <OnboardingStepHeader title={I18n.t('onboarding.preferences.title')} />

          <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-8">
            <Card variant="default" className="border border-border/25 overflow-hidden">
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
                <SelectField
                  label={I18n.t('settings.theme_color')}
                  value={themeColor}
                  options={themeColorOptions}
                  optionsLayout="list"
                  onChange={(value) => onThemeColorChange(value as ThemeColor)}
                />
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
