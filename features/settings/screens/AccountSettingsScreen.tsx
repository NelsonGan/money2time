import { Smartphone, Zap } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';

interface AccountSettingsScreenProps {
  onBack: () => void;
}

type UserModeValue = 'simple' | 'power';

export function AccountSettingsScreen({ onBack }: AccountSettingsScreenProps) {
  const { isSimpleMode, settings, switchToSimpleMode, switchToPowerMode, updateSettings } =
    useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const currentMode: UserModeValue = isSimpleMode ? 'simple' : 'power';

  const handleModeToggle = useCallback(
    (value: boolean) => {
      const nextMode: UserModeValue = value ? 'power' : 'simple';
      if (nextMode === currentMode) return;

      void triggerHaptic('selection');

      if (nextMode === 'simple') {
        Alert.alert(
          I18n.t('settings.switch_to_simple_title'),
          I18n.t('settings.switch_to_simple_message'),
          [
            { text: I18n.t('common.cancel'), style: 'cancel' },
            {
              text: I18n.t('settings.user_mode_simple'),
              onPress: () => switchToSimpleMode(),
            },
          ],
        );
        return;
      }

      Alert.alert(
        I18n.t('settings.switch_to_power_title'),
        I18n.t('settings.switch_to_power_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('settings.user_mode_power'),
            onPress: () => switchToPowerMode(),
          },
        ],
      );
    },
    [currentMode, switchToPowerMode, switchToSimpleMode],
  );

  const handleHapticsToggle = useCallback(
    (value: boolean) => {
      if (value === settings.hapticsEnabled) return;
      updateSettings({ hapticsEnabled: value });
    },
    [settings.hapticsEnabled, updateSettings],
  );

  const modeStatusLabel = isSimpleMode
    ? I18n.t('settings.user_mode_simple')
    : I18n.t('settings.user_mode_power');

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.account_settings')}
          infoTooltip={I18n.t('settings.account_settings_subtitle')}
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
                <Zap size={18} color={themeColors.primary} />
              </View>
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <Text
                    variant="bodyStrong"
                    className="text-foreground"
                    numberOfLines={1}
                    style={styles.titleText}
                  >
                    {I18n.t('settings.user_mode')}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: `${themeColors.primary}18`,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      numberOfLines={1}
                      style={[styles.statusText, { color: themeColors.primary }]}
                    >
                      {modeStatusLabel}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" className="text-foreground/60 mt-0.5" numberOfLines={2}>
                  {isSimpleMode
                    ? I18n.t('settings.user_mode_simple_description')
                    : I18n.t('settings.user_mode_power_description')}
                </Text>
              </View>
              <Switch
                style={styles.switchSmall}
                value={currentMode === 'power'}
                onValueChange={handleModeToggle}
                trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
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
    gap: spacing.xs,
    flexWrap: 'nowrap',
  },
  titleText: {
    flexShrink: 0,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  statusText: {
    fontSize: 11,
    fontFamily: FONT.semibold,
    fontWeight: '600',
  },
  switchSmall: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
