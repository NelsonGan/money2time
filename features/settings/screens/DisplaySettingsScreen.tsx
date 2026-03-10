import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react-native';
import { Alert, Clipboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
import { getThemeColorSwatch, spacing, THEME_COLOR_OPTIONS } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getLocaleLabel, I18n, setAppLocale, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ThemeColor, ThemeMode, UserSettings } from '~/types';

interface DisplaySettingsScreenProps {
  onBack: () => void;
}

export function DisplaySettingsScreen({ onBack }: DisplaySettingsScreenProps) {
  const { resetAllData, resetTransactionsOnly, settings, updateSettings } = useApp();
  const resolvedTheme = useResolvedTheme();
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
    () => [
      ...MAJOR_CURRENCIES.map((item) => ({
        value: item.code,
        label: `${item.code} (${item.symbol}) · ${item.name}`,
      })),
      { value: '__custom__', label: I18n.t('settings.custom_symbol_code') },
    ],
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

  const selectedMajorCurrency = useMemo(
    () => currencyByCode.get(settings.currencyCode),
    [currencyByCode, settings.currencyCode],
  );
  const fallbackMajorCurrency = useMemo(
    () => currencyBySymbol.get(settings.currencySymbol),
    [currencyBySymbol, settings.currencySymbol],
  );
  const themeOptions = [
    { value: 'system' as const, label: I18n.t('settings.theme_system') },
    { value: 'light' as const, label: I18n.t('settings.theme_light') },
    { value: 'dark' as const, label: I18n.t('settings.theme_dark') },
  ] satisfies { value: ThemeMode; label: string }[];
  const themeColorOptions = useMemo(
    () =>
      THEME_COLOR_OPTIONS.map((value) => ({
        value,
        label: I18n.t(`settings.theme_color_${value}`),
        icon: (
          <View
            style={[
              styles.themeColorSwatch,
              { backgroundColor: getThemeColorSwatch(value, resolvedTheme) },
            ]}
          />
        ),
      })),
    [resolvedTheme, settings.locale],
  );
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
  const [didCopyRevenueCatUserId, setDidCopyRevenueCatUserId] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>(settings.themeMode);
  const [selectedThemeColor, setSelectedThemeColor] = useState<ThemeColor>(settings.themeColor);
  const appUserId = settings.appUserId?.trim() ? settings.appUserId : null;

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

  useEffect(() => {
    setSelectedThemeColor(settings.themeColor);
  }, [settings.themeColor]);

  useEffect(() => {
    if (!didCopyRevenueCatUserId) {
      return;
    }

    const timeout = setTimeout(() => {
      setDidCopyRevenueCatUserId(false);
    }, 1600);

    return () => clearTimeout(timeout);
  }, [didCopyRevenueCatUserId]);

  const isCustomCurrencyMode = selectedCurrency === '__custom__';
  const trimmedCustomCurrency = customCurrency.trim();
  const nextCurrencySymbol = useMemo(() => {
    if (selectedCurrency === '__custom__') return trimmedCustomCurrency;
    return currencyByCode.get(selectedCurrency)?.symbol ?? settings.currencySymbol;
  }, [currencyByCode, selectedCurrency, trimmedCustomCurrency, settings.currencySymbol]);
  const nextCurrencyCode = useMemo(() => {
    if (selectedCurrency === '__custom__') return '__custom__';
    return currencyByCode.get(selectedCurrency)?.code ?? settings.currencyCode;
  }, [currencyByCode, selectedCurrency, settings.currencyCode]);
  const hasChanges =
    selectedLocale !== currentLocaleSelection ||
    nextCurrencyCode !== settings.currencyCode ||
    nextCurrencySymbol !== settings.currencySymbol ||
    selectedTheme !== settings.themeMode ||
    selectedThemeColor !== settings.themeColor;
  const canSave =
    hasChanges && (selectedCurrency !== '__custom__' || trimmedCustomCurrency.length > 0);

  const resetDraft = () => {
    setSelectedLocale(currentLocaleSelection);
    setSelectedCurrency(currentCurrencySelection);
    setCustomCurrency(currentCurrencySelection === '__custom__' ? settings.currencySymbol : '');
    setSelectedTheme(settings.themeMode);
    setSelectedThemeColor(settings.themeColor);
  };

  const handleCancel = () => {
    resetDraft();
    onBack();
  };

  const handleCopyRevenueCatUserId = () => {
    if (!appUserId) {
      return;
    }

    Clipboard.setString(appUserId);
    setDidCopyRevenueCatUserId(true);
    void triggerHaptic('selection');
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
      const nextMajorCurrency = currencyByCode.get(selectedCurrency);
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
    const themeUpdates: Partial<Pick<UserSettings, 'themeMode' | 'themeColor'>> = {};
    if (selectedTheme !== settings.themeMode) {
      themeUpdates.themeMode = selectedTheme;
    }
    if (selectedThemeColor !== settings.themeColor) {
      themeUpdates.themeColor = selectedThemeColor;
    }
    if (Object.keys(themeUpdates).length > 0) {
      updateSettings(themeUpdates);
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
              <View className="gap-1.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('settings.user_id')}
                </Text>
                <View style={styles.userIdField}>
                  <Text
                    variant="caption"
                    className="flex-1"
                    selectable
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {appUserId ?? I18n.t('settings.user_id_unavailable')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t(didCopyRevenueCatUserId ? 'common.copied' : 'common.copy')}
                    disabled={!appUserId}
                    onPress={handleCopyRevenueCatUserId}
                    style={styles.copyIconButton}
                  >
                    {didCopyRevenueCatUserId ? (
                      <Check size={16} color={themeColors.success} strokeWidth={2.25} />
                    ) : (
                      <Copy size={16} color={themeColors.textMuted} strokeWidth={2.1} />
                    )}
                  </Pressable>
                </View>
              </View>

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
              <SelectField
                label={I18n.t('settings.theme_color')}
                value={selectedThemeColor}
                options={themeColorOptions}
                optionsLayout="list"
                listItemAlignment="center"
                onChange={(value) => setSelectedThemeColor(value as ThemeColor)}
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
  themeColorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.18)',
  },
  copyIconButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  userIdField: {
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
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
