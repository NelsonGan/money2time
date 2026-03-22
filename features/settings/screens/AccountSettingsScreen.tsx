import { Zap } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface AccountSettingsScreenProps {
  onBack: () => void;
}

type UserModeValue = 'simple' | 'power';

export function AccountSettingsScreen({ onBack }: AccountSettingsScreenProps) {
  const { isSimpleMode, settings, switchToSimpleMode, switchToPowerMode, updateSettings } =
    useApp();
  const themeColors = useThemeColors();
  const currentMode: UserModeValue = isSimpleMode ? 'simple' : 'power';

  const handleModeChange = useCallback(
    (nextMode: UserModeValue) => {
      if (nextMode === currentMode) return;

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

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.account_settings')}
          subtitle={I18n.t('settings.account_settings_subtitle')}
        />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <SettingsSection className="mt-0" title={I18n.t('settings.user_mode')} showAccent={false}>
          <View className="gap-3">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                handleModeChange('simple');
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('settings.user_mode_simple')}
              accessibilityState={{ selected: currentMode === 'simple' }}
            >
              <Card
                variant={currentMode === 'simple' ? 'accent' : 'default'}
                className={currentMode === 'simple' ? 'border-primary/30' : ''}
              >
                <CardContent className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-11 w-11 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor:
                          currentMode === 'simple' ? themeColors.primarySoft : themeColors.surface,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>✨</Text>
                    </View>
                    <View className="flex-1">
                      <Text variant="bodyStrong">{I18n.t('settings.user_mode_simple')}</Text>
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {I18n.t('settings.user_mode_simple_description')}
                      </Text>
                    </View>
                    {currentMode === 'simple' ? (
                      <View className="rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1">
                        <Text variant="label" className="text-primary text-[10px] tracking-wide">
                          {I18n.t('common.active')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </CardContent>
              </Card>
            </Pressable>

            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                handleModeChange('power');
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('settings.user_mode_power')}
              accessibilityState={{ selected: currentMode === 'power' }}
            >
              <Card
                variant={currentMode === 'power' ? 'accent' : 'default'}
                className={currentMode === 'power' ? 'border-primary/30' : ''}
              >
                <CardContent className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-11 w-11 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor:
                          currentMode === 'power' ? themeColors.primarySoft : themeColors.surface,
                      }}
                    >
                      <Zap
                        size={20}
                        color={
                          currentMode === 'power' ? themeColors.primary : themeColors.textMuted
                        }
                      />
                    </View>
                    <View className="flex-1">
                      <Text variant="bodyStrong">{I18n.t('settings.user_mode_power')}</Text>
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {I18n.t('settings.user_mode_power_description')}
                      </Text>
                    </View>
                    {currentMode === 'power' ? (
                      <View className="rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1">
                        <Text variant="label" className="text-primary text-[10px] tracking-wide">
                          {I18n.t('common.active')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </CardContent>
              </Card>
            </Pressable>
          </View>
        </SettingsSection>

        <SettingsSection className="mt-6" title={I18n.t('settings.haptics')} showAccent={false}>
          <Card>
            <CardContent className="py-4">
              <View style={styles.preferenceRow}>
                <View className="flex-1 pr-4">
                  <Text variant="bodyStrong">{I18n.t('settings.haptics')}</Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('settings.haptics_subtitle')}
                  </Text>
                </View>
                <Switch
                  value={settings.hapticsEnabled}
                  onValueChange={handleHapticsToggle}
                  trackColor={{
                    false: `${themeColors.border}80`,
                    true: themeColors.primary,
                  }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </CardContent>
          </Card>
        </SettingsSection>
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
  preferenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
  },
});
