import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  Card,
  CardContent,
  InfoTooltipButton,
  Input,
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

interface HourlyValueSettingsScreenProps {
  onBack: () => void;
}

export function HourlyValueSettingsScreen({ onBack }: HourlyValueSettingsScreenProps) {
  const { settings, updateSettings } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const [workingHoursInput, setWorkingHoursInput] = useState(String(settings.workingHoursPerDay));
  const [workingHoursError, setWorkingHoursError] = useState(false);

  useEffect(() => {
    setWorkingHoursInput(String(settings.workingHoursPerDay));
    setWorkingHoursError(false);
  }, [settings.workingHoursPerDay]);

  const handleWorkdayDisplayToggle = (enabled: boolean) => {
    void triggerHaptic('selection');
    updateSettings({ workdayDisplayEnabled: enabled });
  };

  const handleWorkingHoursChange = (value: string) => {
    setWorkingHoursInput(value);
    if (workingHoursError) setWorkingHoursError(false);
  };

  const commitWorkingHours = () => {
    const parsed = Number(workingHoursInput.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24) {
      setWorkingHoursError(true);
      return;
    }
    const next = Number(parsed.toFixed(2));
    setWorkingHoursInput(String(next));
    setWorkingHoursError(false);
    if (next !== settings.workingHoursPerDay) {
      updateSettings({ workingHoursPerDay: next });
    }
  };

  const workdaysInTwentyFourHours = Number((24 / settings.workingHoursPerDay).toFixed(2));
  const workingHoursTooltip = I18n.t('settings.working_hours_per_day_help', {
    days: workdaysInTwentyFourHours,
    hours: settings.workingHoursPerDay,
  });

  return (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.time_display')}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <CardContent className="py-5 gap-5">
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabel}>
                <Text variant="bodyStrong">{I18n.t('settings.workday_display')}</Text>
                <InfoTooltipButton
                  title={I18n.t('settings.workday_display')}
                  infoTooltip={I18n.t('settings.workday_display_help')}
                />
              </View>
              <Switch
                accessibilityLabel={I18n.t('settings.workday_display')}
                value={settings.workdayDisplayEnabled}
                onValueChange={handleWorkdayDisplayToggle}
                trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {settings.workdayDisplayEnabled ? (
              <Input
                label={I18n.t('settings.working_hours_per_day')}
                labelAccessory={
                  <InfoTooltipButton
                    title={I18n.t('settings.working_hours_per_day')}
                    infoTooltip={workingHoursTooltip}
                  />
                }
                value={workingHoursInput}
                onChangeText={handleWorkingHoursChange}
                onBlur={commitWorkingHours}
                onSubmitEditing={commitWorkingHours}
                variant="numeric"
                returnKeyType="done"
                maxLength={5}
                error={
                  workingHoursError ? I18n.t('settings.working_hours_per_day_error') : undefined
                }
              />
            ) : null}
          </CardContent>
        </Card>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  toggleLabel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
