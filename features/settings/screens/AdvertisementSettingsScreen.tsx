import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface AdvertisementSettingsScreenProps {
  onBack: () => void;
}

export function AdvertisementSettingsScreen({ onBack }: AdvertisementSettingsScreenProps) {
  const { adsEnabledInSession, setAdsEnabledInSession } = useApp();
  const themeColors = useThemeColors();

  const handleAdsToggleChange = useCallback(
    (nextValue: boolean) => {
      if (nextValue === adsEnabledInSession) {
        return;
      }

      if (nextValue) {
        setAdsEnabledInSession(true);
        return;
      }

      Alert.alert(
        I18n.t('settings.ads_prompt_title'),
        I18n.t('settings.ads_prompt_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('settings.ads_prompt_confirm'),
            style: 'destructive',
            onPress: () => setAdsEnabledInSession(false),
          },
        ],
      );
    },
    [adsEnabledInSession, setAdsEnabledInSession],
  );

  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.advertisement')}
          subtitle={I18n.t('settings.advertisement_screen_subtitle')}
        />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <Card variant="soft">
          <CardContent className="gap-2">
            <Text variant="subheading">{I18n.t('settings.advertisement_why_title')}</Text>
            <Text variant="body" tone="muted">
              {I18n.t('settings.advertisement_why_body')}
            </Text>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="gap-4">
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text variant="subheading">{I18n.t('settings.ads_enabled_label')}</Text>
                <Text variant="caption" tone="muted" className="mt-2">
                  {I18n.t('settings.ads_session_note')}
                </Text>
              </View>
              <View style={styles.switchControl}>
                <Switch
                  value={adsEnabledInSession}
                  onValueChange={handleAdsToggleChange}
                  trackColor={{
                    false: themeColors.surfaceMuted,
                    true: themeColors.primaryMuted,
                  }}
                  thumbColor={adsEnabledInSession ? themeColors.primary : '#FFFFFF'}
                  ios_backgroundColor={themeColors.surfaceMuted}
                />
              </View>
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
    gap: spacing.lg,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  switchCopy: {
    flex: 1,
  },
  switchControl: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
});
