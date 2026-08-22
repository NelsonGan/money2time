import { Wallet } from 'lucide-react-native';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { InfoTooltipButton, Text } from '~/components/ui';
import {
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';

interface ReimbursementSettingsScreenProps {
  onBack: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Preferences for reimbursements, reached from the gear on the Reimbursements
 * page. Just the one switch today; the layout leaves room for more.
 */
export function ReimbursementSettingsScreen({ onBack }: ReimbursementSettingsScreenProps) {
  const { settings, updateSettings } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();

  const handleToggleCountAsExpense = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateSettings({ reimbursementsCountAsExpense: value });
      void trackEvent(AnalyticsEvents.REIMBURSEMENT_COUNT_SETTING_CHANGED, { counts: value });
    },
    [updateSettings],
  );

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('reimbursements.settings_title')}
          />

          {/* Off pulls a flagged expense, and the money-in entry paired with it,
              out of every spending total. What that means sits behind the ⓘ. */}
          <View className="mt-4 rounded-2xl border border-border/30 bg-card px-4 py-3">
            <View style={styles.row}>
              <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                <Wallet size={18} color={themeColors.primary} />
              </View>
              <View className="flex-1 flex-row items-center gap-1.5">
                <Text variant="body" className="text-foreground">
                  {I18n.t('reimbursements.count_as_expense_label')}
                </Text>
                <InfoTooltipButton
                  title={I18n.t('reimbursements.count_as_expense_label')}
                  infoTooltip={I18n.t('reimbursements.count_as_expense_hint')}
                />
              </View>
              <Switch
                value={settings.reimbursementsCountAsExpense}
                onValueChange={handleToggleCountAsExpense}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
