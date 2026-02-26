import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { SelectField } from '~/components/ui/select';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
} from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import { useApp } from '~/context/AppContext';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { I18n, setAppLocale, SUPPORTED_LOCALES } from '~/lib/i18n';
import type { ThemeMode } from '~/types';

interface DisplaySettingsScreenProps {
  onBack: () => void;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
};

export function DisplaySettingsScreen({ onBack }: DisplaySettingsScreenProps) {
  const themeColors = useThemeColors();
  const { settings, updateSettings, resetAllData, resetTransactionsOnly } = useApp();

  const languageOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((item) => ({
        value: item,
        label: `${LOCALE_LABELS[item] ?? item} (${item})`,
      })),
    [],
  );
  const currencyOptions = useMemo(
    () => [
      ...MAJOR_CURRENCIES.map((item) => ({
        value: item.code,
        label: `${item.code} (${item.symbol}) · ${item.name}`,
      })),
      { value: '__custom__', label: I18n.t('settings.custom_symbol_code') },
    ],
    [],
  );

  const selectedMajorCurrency = useMemo(
    () => MAJOR_CURRENCIES.find((item) => item.symbol === settings.currencySymbol),
    [settings.currencySymbol],
  );
  const themeOptions = [
    { value: 'system' as const, label: I18n.t('settings.theme_system') },
    { value: 'light' as const, label: I18n.t('settings.theme_light') },
    { value: 'dark' as const, label: I18n.t('settings.theme_dark') },
  ] satisfies { value: ThemeMode; label: string }[];
  const currentLocaleSelection = SUPPORTED_LOCALES.includes(
    settings.locale as (typeof SUPPORTED_LOCALES)[number],
  )
    ? settings.locale
    : 'en';
  const currentCurrencySelection = selectedMajorCurrency?.code ?? '__custom__';

  const [selectedLocale, setSelectedLocale] = useState(currentLocaleSelection);
  const [selectedCurrency, setSelectedCurrency] = useState(currentCurrencySelection);
  const [customCurrency, setCustomCurrency] = useState(
    currentCurrencySelection === '__custom__' ? settings.currencySymbol : '',
  );
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>(settings.themeMode);

  useEffect(() => {
    setSelectedLocale(currentLocaleSelection);
  }, [currentLocaleSelection]);

  useEffect(() => {
    setSelectedCurrency(currentCurrencySelection);
    setCustomCurrency(currentCurrencySelection === '__custom__' ? settings.currencySymbol : '');
  }, [currentCurrencySelection, settings.currencySymbol]);

  useEffect(() => {
    setSelectedTheme(settings.themeMode);
  }, [settings.themeMode]);

  const isCustomCurrencyMode = selectedCurrency === '__custom__';
  const trimmedCustomCurrency = customCurrency.trim();
  const nextCurrencySymbol = useMemo(() => {
    if (selectedCurrency === '__custom__') return trimmedCustomCurrency;
    return (
      MAJOR_CURRENCIES.find((item) => item.code === selectedCurrency)?.symbol ??
      settings.currencySymbol
    );
  }, [selectedCurrency, trimmedCustomCurrency, settings.currencySymbol]);
  const hasChanges =
    selectedLocale !== currentLocaleSelection ||
    nextCurrencySymbol !== settings.currencySymbol ||
    selectedTheme !== settings.themeMode;
  const canSave =
    hasChanges && (selectedCurrency !== '__custom__' || trimmedCustomCurrency.length > 0);

  const resetDraft = () => {
    setSelectedLocale(currentLocaleSelection);
    setSelectedCurrency(currentCurrencySelection);
    setCustomCurrency(currentCurrencySelection === '__custom__' ? settings.currencySymbol : '');
    setSelectedTheme(settings.themeMode);
  };

  const handleCancel = () => {
    resetDraft();
    onBack();
  };

  const handleSave = () => {
    if (!canSave) {
      onBack();
      return;
    }

    if (selectedLocale !== currentLocaleSelection) {
      setAppLocale(selectedLocale);
      updateSettings({ locale: selectedLocale });
    }
    if (nextCurrencySymbol && nextCurrencySymbol !== settings.currencySymbol) {
      updateSettings({ currencySymbol: nextCurrencySymbol });
    }
    if (selectedTheme !== settings.themeMode) {
      updateSettings({ themeMode: selectedTheme });
    }
    onBack();
  };

  return (
    <SettingsPageLayout
      actionBar={
        <SettingsActionBar onCancel={handleCancel} onSave={handleSave} saveDisabled={!canSave} />
      }
    >
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={handleCancel}
          title={I18n.t('settings.display')}
          subtitle={I18n.t('settings.display_subtitle')}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
        }}
      >
        <View>
          <Card>
            <CardContent className="py-5 gap-3.5">
              <SelectField
                label={I18n.t('settings.language')}
                value={selectedLocale}
                options={languageOptions}
                onChange={setSelectedLocale}
              />
              <SelectField
                label={I18n.t('settings.currency')}
                value={selectedCurrency}
                options={currencyOptions}
                onChange={(value) => {
                  setSelectedCurrency(value);
                  if (value === '__custom__' && !customCurrency) {
                    setCustomCurrency(settings.currencySymbol);
                  }
                }}
              />
              {isCustomCurrencyMode ? (
                <View>
                  <Input
                    label={I18n.t('settings.custom_currency')}
                    placeholder={I18n.t('settings.custom_currency_placeholder')}
                    value={customCurrency}
                    onChangeText={setCustomCurrency}
                  />
                </View>
              ) : null}
              <SelectField
                label={I18n.t('settings.theme')}
                value={selectedTheme}
                options={themeOptions}
                onChange={(value) => setSelectedTheme(value as ThemeMode)}
              />
            </CardContent>
          </Card>
        </View>

        <View className="mt-8 gap-2.5">
          <Text variant="caption" tone="muted" className="px-1">
            {I18n.t('settings.danger_description')}
          </Text>
          <Pressable
            onPress={() => {
              void triggerHaptic('warning');
              Alert.alert(
                I18n.t('settings.reset_transactions_title'),
                I18n.t('settings.reset_transactions_message'),
                [
                  { text: I18n.t('common.cancel'), style: 'cancel' },
                  {
                    text: I18n.t('common.reset'),
                    style: 'destructive',
                    onPress: () => resetTransactionsOnly(),
                  },
                ],
              );
            }}
            className="rounded-[22px] border border-border/35 bg-secondary/45 px-5 py-3.5 items-center"
          >
            <Text variant="caption" tone="muted">
              {I18n.t('settings.reset_transactions_only')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void triggerHaptic('warning');
              Alert.alert(
                I18n.t('settings.reset_data_title'),
                I18n.t('settings.reset_data_message'),
                [
                  { text: I18n.t('common.cancel'), style: 'cancel' },
                  {
                    text: I18n.t('common.reset'),
                    style: 'destructive',
                    onPress: () => resetAllData(),
                  },
                ],
              );
            }}
            className="rounded-[22px] border border-coral/30 bg-coral/8 px-5 py-3.5 items-center"
          >
            <Text variant="caption" style={{ color: themeColors.coral }}>
              {I18n.t('settings.reset_all_data')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
