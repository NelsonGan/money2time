import { Repeat } from 'lucide-react-native';
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
import { withColorAlpha } from '~/utils/color';

interface RecurringSettingsScreenProps {
  onBack: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Preferences for recurring rules, reached from the gear on the Recurring
 * page. Today: whether the entries rules make get a tinted background.
 */
export function RecurringSettingsScreen({ onBack }: RecurringSettingsScreenProps) {
  const { settings, updateSettings } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const enabled = settings.highlightRecurringTransactions;

  const handleToggle = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateSettings({ highlightRecurringTransactions: value });
      void trackEvent(AnalyticsEvents.RECURRING_HIGHLIGHT_TOGGLED, { enabled: value });
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
            title={I18n.t('recurring.settings_title')}
          />

          <View className="mt-4 rounded-2xl border border-border/30 bg-card px-4 py-3.5">
            <View className="flex-row items-center gap-3">
              <View
                style={[
                  styles.iconBubble,
                  { backgroundColor: withColorAlpha(themeColors.lavender, 0.18) },
                ]}
              >
                <Repeat size={18} color={themeColors.lavender} />
              </View>
              {/* What the tint means sits behind the ⓘ, as on Reimbursement
                  settings. */}
              <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                <Text variant="body" className="shrink text-foreground">
                  {I18n.t('recurring.highlight_label')}
                </Text>
                <InfoTooltipButton
                  title={I18n.t('recurring.highlight_label')}
                  infoTooltip={I18n.t('recurring.highlight_hint')}
                />
              </View>
              <Switch
                value={enabled}
                onValueChange={handleToggle}
                accessibilityLabel={I18n.t('recurring.highlight_label')}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
