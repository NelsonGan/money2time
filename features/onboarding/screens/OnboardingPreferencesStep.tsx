import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, CardContent, SelectField, Text } from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
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
  const selectedLocale = SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])
    ? locale
    : 'en';
  const currentCurrencyCode = MAJOR_CURRENCIES.some((item) => item.code === currencyCode)
    ? currencyCode
    : (MAJOR_CURRENCIES.find((item) => item.symbol === currencySymbol)?.code ?? 'USD');
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
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
                    label: `${getLocaleLabel(item)} (${item})`,
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
                    if (found) onCurrencyChange({ code: found.code, symbol: found.symbol });
                  }}
                />
                <Text variant="label" tone="muted">
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
