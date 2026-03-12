import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  SegmentedToggle,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

interface AccountSettingsScreenProps {
  onBack: () => void;
}

type UserModeValue = 'simple' | 'power';

export function AccountSettingsScreen({ onBack }: AccountSettingsScreenProps) {
  const { isSimpleMode, switchToSimpleMode, switchToPowerMode } = useApp();
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

  const activeModeDescription = isSimpleMode
    ? I18n.t('settings.user_mode_simple_description')
    : I18n.t('settings.user_mode_power_description');

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
        <Card variant="accent">
          <CardContent className="gap-4">
            <View className="gap-1.5">
              <Text variant="label" tone="muted">
                {I18n.t('settings.user_mode')}
              </Text>
              <Text variant="friendly" tone="muted">
                {I18n.t('settings.account_settings_description')}
              </Text>
            </View>

            <SegmentedToggle<UserModeValue>
              value={currentMode}
              onChange={handleModeChange}
              options={[
                { value: 'simple', label: I18n.t('settings.user_mode_simple') },
                { value: 'power', label: I18n.t('settings.user_mode_power') },
              ]}
            />

            <View className="rounded-[22px] border border-border/30 bg-secondary/30 px-4 py-3">
              <Text variant="caption" tone="muted">
                {activeModeDescription}
              </Text>
            </View>
          </CardContent>
        </Card>
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
});
