import React from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { SelectField } from '~/components/ui/select';
import { Text } from '~/components/ui/text';
import { triggerHaptic } from '~/services/haptics';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n, SUPPORTED_LOCALES } from '~/lib/i18n';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';

interface OnboardingPreferencesStepProps {
  locale: string;
  currencySymbol: string;
  onLocaleChange: (locale: string) => void;
  onCurrencySymbolChange: (symbol: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

export function OnboardingPreferencesStep({
  locale,
  currencySymbol,
  onLocaleChange,
  onCurrencySymbolChange,
  onBack,
  onContinue,
}: OnboardingPreferencesStepProps) {
  const selectedLocale = SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])
    ? locale
    : 'en';
  const currentCurrencyCode =
    MAJOR_CURRENCIES.find((item) => item.symbol === currencySymbol)?.code ?? 'USD';
  const swipeBackHandlers = useEdgeSwipeBack(onBack);

  return (
    <View {...swipeBackHandlers} className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(350)} className="mt-8">
          <Card variant="soft" className="border border-border/30">
            <CardContent className="py-4 gap-3">
              <SelectField
                label={I18n.t('onboarding.value_prop.language_label')}
                value={selectedLocale}
                options={SUPPORTED_LOCALES.map((item) => ({
                  value: item,
                  label: `${LOCALE_LABELS[item] ?? item} (${item})`,
                }))}
                onChange={(value) => onLocaleChange(value)}
              />
              <SelectField
                label={I18n.t('onboarding.value_prop.currency_label')}
                value={currentCurrencyCode}
                options={MAJOR_CURRENCIES.map((item) => ({
                  value: item.code,
                  label: `${item.code} (${item.symbol}) · ${item.name}`,
                }))}
                onChange={(value) => {
                  const found = MAJOR_CURRENCIES.find((item) => item.code === value);
                  if (found) onCurrencySymbolChange(found.symbol);
                }}
              />
              <Text variant="label" tone="muted">
                {I18n.t('onboarding.value_prop.prefill_note')}
              </Text>
            </CardContent>
          </Card>
        </Animated.View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 bg-background/95 border-t border-border/20 px-6 pb-10 pt-4">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => {
              void triggerHaptic('selection');
              onBack();
            }}
          >
            <Text>{I18n.t('common.back')}</Text>
          </Button>
          <Button
            className="flex-[2]"
            onPress={() => {
              void triggerHaptic('medium');
              onContinue();
            }}
          >
            <Text>{I18n.t('common.continue')}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
