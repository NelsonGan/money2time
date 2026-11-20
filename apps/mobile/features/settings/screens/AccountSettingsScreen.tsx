import { LocateFixed, MapPin, Smartphone } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { InfoTooltipButton } from '~/components/ui/info-tooltip';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  getLocationPermission,
  type LocationPermissionState,
  openLocationSettings,
  requestLocationPermission,
} from '~/features/places/services/deviceLocation';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';

interface AccountSettingsScreenProps {
  onBack: () => void;
}

export function AccountSettingsScreen({ onBack }: AccountSettingsScreenProps) {
  const { settings, updateSettings } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const handleHapticsToggle = useCallback(
    (value: boolean) => {
      if (value === settings.hapticsEnabled) return;
      updateSettings({ hapticsEnabled: value });
    },
    [settings.hapticsEnabled, updateSettings],
  );

  const locationsEnabled = settings.transactionLocationsEnabled;
  const [permission, setPermission] = useState<LocationPermissionState | null>(null);

  // Re-read the permission when the user comes back from the Settings app.
  useEffect(() => {
    if (!locationsEnabled) return undefined;
    void getLocationPermission().then(setPermission);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getLocationPermission().then(setPermission);
    });
    return () => subscription.remove();
  }, [locationsEnabled]);

  const handleLocationsToggle = useCallback(
    async (value: boolean) => {
      if (value === settings.transactionLocationsEnabled) return;
      void triggerHaptic('selection');
      updateSettings({ transactionLocationsEnabled: value });
      void trackEvent(AnalyticsEvents.TRANSACTION_LOCATIONS_TOGGLED, { enabled: value });
      // Ask right away, while the reason is on screen. A no still leaves place
      // search working; only "where I am" needs the permission.
      if (value) setPermission(await requestLocationPermission());
    },
    [settings.transactionLocationsEnabled, updateSettings],
  );

  const handleAutoTagToggle = useCallback(
    (value: boolean) => {
      if (value === settings.transactionLocationAutoTag) return;
      void triggerHaptic('selection');
      updateSettings({ transactionLocationAutoTag: value });
    },
    [settings.transactionLocationAutoTag, updateSettings],
  );

  const permissionBlocked =
    locationsEnabled &&
    permission !== null &&
    permission.status !== 'granted' &&
    permission.status !== 'unavailable';

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.account_settings')}
        />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.cardList}>
          <View
            className="rounded-2xl border border-border/30 bg-card shadow-soft"
            style={styles.card}
          >
            <View style={styles.row}>
              <View
                className="items-center justify-center rounded-xl bg-primary/8 border border-primary/10"
                style={styles.iconBox}
              >
                <Smartphone size={18} color={themeColors.primary} />
              </View>
              <View style={styles.titleBlock}>
                <Text variant="bodyStrong" className="text-foreground" numberOfLines={1}>
                  {I18n.t('settings.haptics')}
                </Text>
                <Text variant="caption" className="text-foreground/60 mt-0.5" numberOfLines={2}>
                  {I18n.t('settings.haptics_subtitle')}
                </Text>
              </View>
              <Switch
                style={styles.switchSmall}
                value={settings.hapticsEnabled}
                onValueChange={handleHapticsToggle}
                trackColor={{
                  false: `${themeColors.border}80`,
                  true: themeColors.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View
            className="rounded-2xl border border-border/30 bg-card shadow-soft"
            style={styles.card}
          >
            <View style={styles.row}>
              <View
                className="items-center justify-center rounded-xl bg-primary/8 border border-primary/10"
                style={styles.iconBox}
              >
                <MapPin size={18} color={themeColors.primary} />
              </View>
              <View style={[styles.titleBlock, styles.titleRow]}>
                <Text variant="bodyStrong" className="shrink text-foreground" numberOfLines={2}>
                  {I18n.t('locations.settings_title')}
                </Text>
                <InfoTooltipButton
                  title={I18n.t('locations.settings_title')}
                  infoTooltip={I18n.t('locations.settings_help')}
                />
              </View>
              <Switch
                style={styles.switchSmall}
                accessibilityLabel={I18n.t('locations.settings_title')}
                value={locationsEnabled}
                onValueChange={(value) => void handleLocationsToggle(value)}
                trackColor={{
                  false: `${themeColors.border}80`,
                  true: themeColors.primary,
                }}
                thumbColor="#FFFFFF"
              />
            </View>
            {locationsEnabled ? (
              <>
                <View className="mx-3 h-px bg-border/40" />
                <View style={styles.row}>
                  <View style={styles.iconBox} className="items-center justify-center">
                    <LocateFixed size={18} color={themeColors.textMuted} />
                  </View>
                  <View style={[styles.titleBlock, styles.titleRow]}>
                    <Text variant="body" className="shrink text-foreground" numberOfLines={2}>
                      {I18n.t('locations.auto_tag')}
                    </Text>
                    <InfoTooltipButton
                      title={I18n.t('locations.auto_tag')}
                      infoTooltip={I18n.t('locations.auto_tag_help')}
                    />
                  </View>
                  <Switch
                    style={styles.switchSmall}
                    accessibilityLabel={I18n.t('locations.auto_tag')}
                    value={settings.transactionLocationAutoTag}
                    onValueChange={handleAutoTagToggle}
                    trackColor={{
                      false: `${themeColors.border}80`,
                      true: themeColors.primary,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {permissionBlocked ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      void triggerHaptic('selection');
                      if (permission?.canAskAgain) {
                        void requestLocationPermission().then(setPermission);
                      } else {
                        void openLocationSettings();
                      }
                    }}
                    className="mx-3 mb-3 flex-row items-center justify-between rounded-xl bg-secondary/60 px-3 py-2.5 active:opacity-70"
                  >
                    <Text variant="caption" tone="muted" className="flex-1">
                      {I18n.t('locations.permission_off')}
                    </Text>
                    <Text variant="caption" tone="primary" className="font-semibold">
                      {permission?.canAskAgain
                        ? I18n.t('locations.permission_allow')
                        : I18n.t('locations.open_settings')}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
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
  cardList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  card: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconBox: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchSmall: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
