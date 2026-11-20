import React, { useMemo } from 'react';
import { View } from 'react-native';

import { SelectField } from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { getThemeColorSwatch, THEME_COLOR_OPTIONS } from '~/constants/designSystem';
import { useResolvedTheme } from '~/context/ThemeContext';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { getLocaleLabel, I18n, orderedLocales, SUPPORTED_LOCALES } from '~/lib/i18n';
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
      orderedLocales(locale).map((item) => ({
        value: item,
        label: `${getLocaleLabel(item)} (${item})`,
      })),
    [locale],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the labels come from I18n, which follows `locale`
    [locale, resolvedTheme],
  );
  const selectedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  const currentCurrencyCode = currencyByCode.has(currencyCode)
    ? currencyCode
    : (currencyBySymbol.get(currencySymbol)?.code ?? 'USD');

  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.preferences.title')}
      mascot="presenting"
      onBack={onBack}
      primaryLabel={I18n.t('common.continue')}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue();
      }}
    >
      <View className="gap-4 rounded-[22px] border border-border/40 bg-card px-4 py-5">
        <SelectField
          label={I18n.t('onboarding.preferences.language_label')}
          value={selectedLocale}
          options={languageOptions}
          onChange={(value) => onLocaleChange(value)}
        />
        <SelectField
          label={I18n.t('onboarding.preferences.currency_label')}
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
      </View>
    </OnboardingStepLayout>
  );
}
