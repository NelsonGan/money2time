import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsRowItem,
} from '~/components/ui/settings';
import { DisplayModeToggle } from '~/features/transactions/components';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';

interface SettingsScreenProps {
  onOpenDisplay: () => void;
  onOpenHourlyValue: () => void;
  onOpenAccounts: () => void;
  onOpenCategories: () => void;
  onOpenRecurring: () => void;
}

export function SettingsScreen({
  onOpenDisplay,
  onOpenHourlyValue,
  onOpenAccounts,
  onOpenCategories,
  onOpenRecurring,
}: SettingsScreenProps) {
  const { settings, monthlyWages, updateSettings } = useApp();

  const latestWage = monthlyWages[0] ?? null;

  return (
    <SettingsPageLayout>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
        }}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <SettingsHeader
            className="px-0 pt-5 pb-2"
            title={I18n.t('settings.title')}
            subtitle={I18n.t('settings.subtitle')}
            rightAccessory={<DisplayModeToggle />}
          />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <View className="mt-2 gap-2.5">
            <SettingsRowItem
              emoji="🎨"
              label={I18n.t('settings.display')}
              subtitle={I18n.t('settings.display_subtitle')}
              onPress={onOpenDisplay}
            />
            <SettingsRowItem
              emoji="⏱️"
              label={I18n.t('settings.hourly_value')}
              subtitle={
                latestWage
                  ? I18n.t('settings.hourly_value_latest', {
                      value: `${settings.currencySymbol}${latestWage.trueHourlyRate.toFixed(2)}/hr`,
                    })
                  : I18n.t('settings.manage_formulas')
              }
              onPress={onOpenHourlyValue}
            />
            <SettingsRowItem
              emoji="🏦"
              label={I18n.t('settings.accounts')}
              subtitle={I18n.t('settings.accounts_subtitle')}
              onPress={onOpenAccounts}
            />
            <SettingsRowItem
              emoji="📂"
              label={I18n.t('settings.categories')}
              subtitle={I18n.t('settings.categories_subtitle')}
              onPress={onOpenCategories}
            />
            <SettingsRowItem
              emoji="🔁"
              label={I18n.t('settings.recurring')}
              subtitle={I18n.t('settings.recurring_subtitle')}
              onPress={onOpenRecurring}
            />
            <SettingsRowItem
              emoji="👋"
              label={I18n.t('settings.replay_onboarding')}
              subtitle={I18n.t('settings.replay_onboarding_subtitle')}
              onPress={() => {
                Alert.alert(I18n.t('settings.replay_title'), I18n.t('settings.replay_message'), [
                  { text: I18n.t('common.cancel'), style: 'cancel' },
                  {
                    text: I18n.t('settings.replay_action'),
                    onPress: () => {
                      updateSettings({ onboardingCompleted: false });
                    },
                  },
                ]);
              }}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
