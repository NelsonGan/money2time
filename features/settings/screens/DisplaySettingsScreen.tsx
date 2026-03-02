import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  Input,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { getLocaleLabel, I18n, setAppLocale, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ThemeMode } from '~/types';

interface DisplaySettingsScreenProps {
  onBack: () => void;
}

export function DisplaySettingsScreen({ onBack }: DisplaySettingsScreenProps) {
  const { settings, updateSettings, resetAllData, resetTransactionsOnly } = useApp();

  const languageOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((item) => ({
        value: item,
        label: `${getLocaleLabel(item)} (${item})`,
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
    () => MAJOR_CURRENCIES.find((item) => item.code === settings.currencyCode),
    [settings.currencyCode],
  );
  const fallbackMajorCurrency = useMemo(
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
  const currentCurrencySelection =
    settings.currencyCode === '__custom__'
      ? '__custom__'
      : (selectedMajorCurrency?.code ?? fallbackMajorCurrency?.code ?? '__custom__');

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
  const nextCurrencyCode = useMemo(() => {
    if (selectedCurrency === '__custom__') return '__custom__';
    return (
      MAJOR_CURRENCIES.find((item) => item.code === selectedCurrency)?.code ?? settings.currencyCode
    );
  }, [selectedCurrency, settings.currencyCode]);
  const hasChanges =
    selectedLocale !== currentLocaleSelection ||
    nextCurrencyCode !== settings.currencyCode ||
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
    if (selectedCurrency === '__custom__') {
      if (
        trimmedCustomCurrency &&
        (trimmedCustomCurrency !== settings.currencySymbol ||
          settings.currencyCode !== '__custom__')
      ) {
        updateSettings({ currencyCode: '__custom__', currencySymbol: trimmedCustomCurrency });
      }
    } else {
      const nextMajorCurrency = MAJOR_CURRENCIES.find((item) => item.code === selectedCurrency);
      if (
        nextMajorCurrency &&
        (nextMajorCurrency.code !== settings.currencyCode ||
          nextMajorCurrency.symbol !== settings.currencySymbol)
      ) {
        updateSettings({
          currencyCode: nextMajorCurrency.code,
          currencySymbol: nextMajorCurrency.symbol,
        });
      }
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
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={handleCancel}
          title={I18n.t('settings.display')}
          subtitle={I18n.t('settings.display_subtitle')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
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

        <View style={styles.dangerSection}>
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
            style={styles.secondaryDangerAction}
            className="border border-border/35 bg-secondary/45"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('settings.reset_transactions_only')}
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
            style={styles.primaryDangerAction}
            className="border border-coral/30 bg-coral/8"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('settings.reset_all_data')}
          >
            <Text variant="caption" className="text-destructive">
              {I18n.t('settings.reset_all_data')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  dangerSection: {
    marginTop: spacing.xl + spacing.xs,
    gap: spacing.sm,
  },
  secondaryDangerAction: {
    borderRadius: 22,
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDangerAction: {
    borderRadius: 22,
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
