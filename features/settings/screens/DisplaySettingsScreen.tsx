import { Check, Copy } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Clipboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  Input,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { getThemeColorSwatch, spacing, THEME_COLOR_OPTIONS } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getLocaleLabel, I18n, orderedLocales, setAppLocale, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ThemeColor, ThemeMode, WeekStartsOn } from '~/types';
import { clampFirstDayOfMonth, MAX_FIRST_DAY_OF_MONTH } from '~/utils/financialMonth';

interface DisplaySettingsScreenProps {
  onBack: () => void;
}

export function DisplaySettingsScreen({ onBack }: DisplaySettingsScreenProps) {
  const { settings, updateSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const currentLocaleSelection = SUPPORTED_LOCALES.includes(
    settings.locale as (typeof SUPPORTED_LOCALES)[number],
  )
    ? settings.locale
    : 'en';

  const languageOptions = useMemo(
    () =>
      orderedLocales(currentLocaleSelection).map((item) => ({
        value: item,
        label: `${getLocaleLabel(item)} (${item})`,
      })),
    [currentLocaleSelection],
  );
  const themeOptions = [
    { value: 'system' as const, label: I18n.t('settings.theme_system') },
    { value: 'light' as const, label: I18n.t('settings.theme_light') },
    { value: 'dark' as const, label: I18n.t('settings.theme_dark') },
  ] satisfies { value: ThemeMode; label: string }[];
  const themeColorOptions = THEME_COLOR_OPTIONS.map((value) => ({
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
  }));
  const [didCopyRevenueCatUserId, setDidCopyRevenueCatUserId] = useState(false);
  const appUserId = settings.appUserId?.trim() ? settings.appUserId : null;
  // Only the last 4 characters of the user id are ever shown or copied.
  const appUserIdLast4 = appUserId ? appUserId.slice(-4) : null;
  const maskedUserId = appUserIdLast4 ? `••••${appUserIdLast4}` : null;

  useEffect(() => {
    if (!didCopyRevenueCatUserId) {
      return;
    }

    const timeout = setTimeout(() => {
      setDidCopyRevenueCatUserId(false);
    }, 1600);

    return () => clearTimeout(timeout);
  }, [didCopyRevenueCatUserId]);

  const handleCopyRevenueCatUserId = () => {
    if (!appUserIdLast4) {
      return;
    }

    Clipboard.setString(appUserIdLast4);
    setDidCopyRevenueCatUserId(true);
    void triggerHaptic('selection');
  };

  const handleLanguageChange = (nextLocale: string) => {
    if (nextLocale === currentLocaleSelection) {
      return;
    }

    Alert.alert(
      I18n.t('settings.language_confirm_title'),
      I18n.t('settings.language_confirm_message', {
        language: getLocaleLabel(nextLocale),
      }),
      [
        {
          text: I18n.t('common.cancel'),
          style: 'cancel',
        },
        {
          text: I18n.t('settings.language_confirm_action'),
          onPress: () => {
            setAppLocale(nextLocale);
            updateSettings({ locale: nextLocale });
          },
        },
      ],
    );
  };

  const handleThemeChange = (value: string) => {
    const nextTheme = value as ThemeMode;
    if (nextTheme === settings.themeMode) {
      return;
    }
    updateSettings({ themeMode: nextTheme });
  };

  const handleThemeColorChange = (value: string) => {
    const nextThemeColor = value as ThemeColor;
    if (nextThemeColor === settings.themeColor) {
      return;
    }
    updateSettings({ themeColor: nextThemeColor });
  };

  const weekStartsOnOptions = useMemo(
    () => [
      { value: '1', label: I18n.t('settings.first_day_monday') },
      { value: '0', label: I18n.t('settings.first_day_sunday') },
      { value: '6', label: I18n.t('settings.first_day_saturday') },
    ],
    [],
  );

  const handleWeekStartsOnChange = (value: string) => {
    const parsed = Number(value);
    if (parsed !== 0 && parsed !== 1 && parsed !== 6) return;
    const next = parsed as WeekStartsOn;
    if (next === settings.weekStartsOn) return;
    void triggerHaptic('selection');
    updateSettings({ weekStartsOn: next });
  };

  const firstDayOfMonthOptions = useMemo(
    () =>
      Array.from({ length: MAX_FIRST_DAY_OF_MONTH }, (_, index) => {
        const day = index + 1;
        return { value: String(day), label: String(day) };
      }),
    [],
  );

  const handleFirstDayOfMonthChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    const next = clampFirstDayOfMonth(parsed);
    if (next === clampFirstDayOfMonth(settings.firstDayOfMonth)) return;
    void triggerHaptic('selection');
    updateSettings({ firstDayOfMonth: next });
  };

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.display')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
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
                    {maskedUserId ?? I18n.t('settings.user_id_unavailable')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t(
                      didCopyRevenueCatUserId ? 'common.copied' : 'common.copy',
                    )}
                    disabled={!appUserIdLast4}
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
                value={currentLocaleSelection}
                options={languageOptions}
                onChange={handleLanguageChange}
              />
              <SelectField
                label={I18n.t('settings.theme')}
                value={settings.themeMode}
                options={themeOptions}
                onChange={handleThemeChange}
              />
              <SelectField
                label={I18n.t('settings.theme_color')}
                value={settings.themeColor}
                options={themeColorOptions}
                optionsLayout="list"
                listItemAlignment="center"
                onChange={handleThemeColorChange}
              />
              <SelectField
                label={I18n.t('settings.first_day_of_week')}
                value={String(settings.weekStartsOn)}
                options={weekStartsOnOptions}
                onChange={handleWeekStartsOnChange}
              />
              <SelectField
                label={I18n.t('settings.first_day_of_month')}
                value={String(clampFirstDayOfMonth(settings.firstDayOfMonth))}
                options={firstDayOfMonthOptions}
                optionsLayout="list"
                listItemAlignment="center"
                onChange={handleFirstDayOfMonthChange}
                infoTooltip={I18n.t('settings.first_day_of_month_help')}
              />
            </CardContent>
          </Card>
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
});
