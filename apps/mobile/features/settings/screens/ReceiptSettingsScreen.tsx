import { ReceiptText } from 'lucide-react-native';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '~/components/ui';
import {
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface ReceiptSettingsScreenProps {
  onBack: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});

/**
 * Full-page home for receipt-scan preferences, reached from the gear on the
 * Receipts page. Just the one opt-in today; the layout leaves room for more.
 */
export function ReceiptSettingsScreen({ onBack }: ReceiptSettingsScreenProps) {
  const { quickEntryPrefs, updateQuickEntryPrefs } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();

  const handleToggleSaveScanned = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateQuickEntryPrefs({ saveScannedReceipts: value });
    },
    [updateQuickEntryPrefs],
  );

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('receipts.settings_title')}
          />

          <View className="mt-4">
            <View style={styles.card} className="bg-card border border-border/30">
              <View style={styles.row}>
                <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
                  <ReceiptText size={18} color={themeColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="body" className="text-foreground">
                    {I18n.t('receipts.save_scanned_label')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('receipts.save_scanned_hint')}
                  </Text>
                </View>
                <Switch
                  value={quickEntryPrefs.saveScannedReceipts}
                  onValueChange={handleToggleSaveScanned}
                  trackColor={{ false: themeColors.border, true: themeColors.primary }}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
