import { Smartphone } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

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
  switchSmall: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
