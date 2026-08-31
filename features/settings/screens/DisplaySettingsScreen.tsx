import * as Clipboard from 'expo-clipboard';
import { Check, ChevronRight, Copy } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  InfoTooltipButton,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { appIconById } from '~/constants/appIcons';
import { getThemeColorSwatch, spacing, THEME_COLOR_OPTIONS } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getLocaleLabel, I18n, orderedLocales, setAppLocale, SUPPORTED_LOCALES } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { IconStyle, ThemeColor, ThemeMode, WeekStartsOn } from '~/types';
import {
  monthCycleDefaultDay,
  monthCycleOf,
  monthCycleOverrideCount,
} from '~/utils/financialMonth';

interface DisplaySettingsScreenProps {
  onBack: () => void;
  onOpenAppIcon: () => void;
  onOpenMonthCycle: () => void;
}

export function DisplaySettingsScreen({
  onBack,
  onOpenAppIcon,
  onOpenMonthCycle,
}: DisplaySettingsScreenProps) {
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
  // Only the last 8 characters of the user id are ever shown or copied.
  const appUserIdSuffix = appUserId ? appUserId.slice(-8) : null;
  const maskedUserId = appUserIdSuffix ? `••••${appUserIdSuffix}` : null;

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
    if (!appUserIdSuffix) {
      return;
    }

    void Clipboard.setStringAsync(appUserIdSuffix);
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

  const iconStyleOptions = useMemo(
    () =>
      [
        { value: 'clay' as const, label: I18n.t('settings.icon_style_clay') },
        { value: 'flat' as const, label: I18n.t('settings.icon_style_flat') },
      ] satisfies { value: IconStyle; label: string }[],
    [],
  );

  const handleIconStyleChange = (value: string) => {
    const next = value === 'flat' ? 'flat' : 'clay';
    if (next === settings.iconStyle) {
      return;
    }
    void triggerHaptic('selection');
    updateSettings({ iconStyle: next });
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

  // The month cycle is a page of its own, not a dropdown: the default day is
  // only half of it, and the other half is the twelve months that can each
  // start somewhere else. The row shows the default day, which is the answer
  // to the question the label asks; the months are one tap away.
  const monthCycleValue = String(monthCycleDefaultDay(monthCycleOf(settings)));

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
                    disabled={!appUserIdSuffix}
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
                label={I18n.t('settings.icon_style')}
                value={settings.iconStyle}
                options={iconStyleOptions}
                onChange={handleIconStyleChange}
                infoTooltip={I18n.t('settings.icon_style_help')}
              />
              {/* Not a SelectField: the options are 74px tiles, so they get a
                  page of their own. It borrows the trigger's metrics anyway so
                  it lines up with the fields above and below it. */}
              <View className="w-full">
                <View className="mb-2.5 px-1 flex-row items-center gap-1.5">
                  <Text variant="caption" tone="muted">
                    {I18n.t('app_icon.title')}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('app_icon.title')}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenAppIcon();
                  }}
                  className="h-[54px] flex-row items-center gap-3 rounded-3xl border border-border/40 bg-card/95 px-4"
                >
                  <Image
                    source={
                      resolvedTheme === 'dark'
                        ? appIconById(settings.appIcon).previewDark
                        : appIconById(settings.appIcon).previewLight
                    }
                    style={styles.appIconPreview}
                  />
                  <Text variant="body" numberOfLines={1} className="flex-1">
                    {I18n.t(appIconById(settings.appIcon).labelKey)}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
              <SelectField
                label={I18n.t('settings.first_day_of_week')}
                value={String(settings.weekStartsOn)}
                options={weekStartsOnOptions}
                onChange={handleWeekStartsOnChange}
              />
              {/* Not a SelectField for the same reason the app-icon row isn't:
                  the choice needs a page. It borrows the trigger's metrics so it
                  still lines up with the fields around it. */}
              <View className="w-full">
                <View className="mb-2.5 px-1 flex-row items-center gap-1.5">
                  <Text variant="caption" tone="muted">
                    {I18n.t('settings.first_day_of_month')}
                  </Text>
                  <InfoTooltipButton
                    title={I18n.t('settings.first_day_of_month')}
                    infoTooltip={I18n.t('settings.first_day_of_month_help')}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('settings.first_day_of_month')}
                  accessibilityValue={{ text: monthCycleValue }}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenMonthCycle();
                  }}
                  className="h-[54px] flex-row items-center gap-3 rounded-3xl border border-border/40 bg-card/95 px-4"
                >
                  <Text variant="body" numberOfLines={1} className="flex-1">
                    {monthCycleValue}
                  </Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
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
  appIconPreview: {
    height: 32,
    width: 32,
    // Roughly the iOS squircle's 22.4%, so the thumbnail reads as the icon
    // rather than as a picture of one.
    borderRadius: 8,
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
