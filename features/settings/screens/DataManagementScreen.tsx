import * as DocumentPicker from 'expo-document-picker';
import { ChevronRight, CloudUpload, Download, Trash2, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { ImportingOverlay } from '~/components/feedback/ImportingOverlay';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { exportDatabase, pickAndImportDatabase } from '~/services/dataManagementService';
import { triggerHaptic } from '~/services/haptics';

interface DataManagementScreenProps {
  onBack: () => void;
  onOpenAutoBackup?: () => void;
}

type ImportSource = 'money2time' | 'money_manager';

export function DataManagementScreen({ onBack, onOpenAutoBackup }: DataManagementScreenProps) {
  const { importMoneyManagerBackup, refreshAll, resetAllData, settings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const [isExporting, setIsExporting] = useState(false);
  // `activeFlow` covers the whole picker + import lifecycle and drives button
  // disable state, so rapid taps can't fire two DocumentPicker calls in
  // parallel (iOS rejects the second with "different document pick in
  // progress"). `importingSource` drives only the overlay, and is set after
  // the picker dismisses so it never contends with the picker on iOS.
  const [activeFlow, setActiveFlow] = useState<ImportSource | null>(null);
  const [importingSource, setImportingSource] = useState<ImportSource | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportDatabase();
    } catch (e) {
      Alert.alert(
        I18n.t('data_management.export_error_title'),
        e instanceof Error ? e.message : I18n.t('data_management.export_error_message'),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = () => {
    Alert.alert(
      I18n.t('data_management.import_confirm_title'),
      I18n.t('data_management.import_confirm_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('data_management.import_confirm_action'),
          style: 'destructive',
          onPress: () => void performImport(),
        },
      ],
    );
  };

  const performImport = async () => {
    if (activeFlow) return;
    setActiveFlow('money2time');
    try {
      const result = await pickAndImportDatabase({
        onFilePicked: () => setImportingSource('money2time'),
      });
      if (result.canceled) return;

      if (result.success) {
        refreshAll();
        Alert.alert(
          I18n.t('data_management.import_success_title'),
          I18n.t('data_management.import_success_message'),
        );
      } else {
        Alert.alert(
          I18n.t('data_management.import_error_title'),
          result.error ?? I18n.t('data_management.import_error_message'),
        );
      }
    } catch (e) {
      Alert.alert(
        I18n.t('data_management.import_error_title'),
        e instanceof Error ? e.message : I18n.t('data_management.import_error_message'),
      );
    } finally {
      setImportingSource(null);
      setActiveFlow(null);
    }
  };

  const handleMoneyManagerImport = () => {
    Alert.alert(
      I18n.t('data_management.import_money_manager_confirm_title'),
      I18n.t('data_management.import_money_manager_confirm_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('data_management.import_money_manager_confirm_action'),
          style: 'destructive',
          onPress: () => void performMoneyManagerImport(),
        },
      ],
    );
  };

  const performMoneyManagerImport = async () => {
    if (activeFlow) return;
    setActiveFlow('money_manager');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) return;

      const picked = result.assets[0];
      const name = picked.name?.toLowerCase() ?? '';
      const uri = picked.uri?.toLowerCase() ?? '';
      const hasMmbakExt = name.endsWith('.mmbak') || uri.endsWith('.mmbak');

      if (!hasMmbakExt) {
        Alert.alert(
          I18n.t('data_management.import_money_manager_invalid_file_title'),
          I18n.t('data_management.import_money_manager_invalid_file_message'),
        );
        return;
      }

      // Only show the blocking overlay after the picker has dismissed with a
      // valid file — on iOS the picker can't present on top of another modal.
      setImportingSource('money_manager');
      const summary = await importMoneyManagerBackup(picked.uri, picked.name);
      Alert.alert(
        I18n.t('data_management.import_money_manager_success_title'),
        I18n.t('data_management.import_money_manager_success_message', {
          accounts: summary.accounts,
          categories: summary.categories,
          transactions: summary.transactions,
        }),
      );
    } catch (e) {
      Alert.alert(
        I18n.t('data_management.import_error_title'),
        e instanceof Error ? e.message : I18n.t('errors.import_failed_generic'),
      );
    } finally {
      setImportingSource(null);
      setActiveFlow(null);
    }
  };

  const handleResetAllData = () => {
    void triggerHaptic('warning');
    Alert.alert(I18n.t('settings.reset_data_title'), I18n.t('settings.reset_data_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.reset'),
        style: 'destructive',
        onPress: () => resetAllData(),
      },
    ]);
  };

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('data_management.title')}
          subtitle={I18n.t('data_management.subtitle')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        {onOpenAutoBackup ? (
          <Card style={{ marginBottom: 14 }}>
            <CardContent className="py-4">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onOpenAutoBackup();
                }}
                style={styles.autoBackupRow}
              >
                <View
                  style={[styles.iconContainer, { backgroundColor: `${themeColors.primary}14` }]}
                >
                  <CloudUpload size={18} color={themeColors.primary} />
                </View>
                <View style={styles.sectionTextWrap}>
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('auto_backup.entry_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {settings.autoBackupEnabled
                      ? I18n.t('auto_backup.entry_enabled')
                      : I18n.t('auto_backup.entry_disabled')}
                  </Text>
                </View>
                <ChevronRight size={16} color={themeColors.muted} />
              </Pressable>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="py-5 gap-5">
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View
                  style={[styles.iconContainer, { backgroundColor: `${themeColors.primary}14` }]}
                >
                  <Download size={18} color={themeColors.primary} />
                </View>
                <View style={styles.sectionTextWrap}>
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('data_management.export_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('data_management.export_description')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                className="mt-3"
                onPress={() => void handleExport()}
                disabled={isExporting || activeFlow !== null}
              >
                <Text>
                  {isExporting
                    ? I18n.t('data_management.exporting')
                    : I18n.t('data_management.export_action')}
                </Text>
              </Button>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View
                  style={[styles.iconContainer, { backgroundColor: `${themeColors.primary}14` }]}
                >
                  <Upload size={18} color={themeColors.primary} />
                </View>
                <View style={styles.sectionTextWrap}>
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('data_management.import_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('data_management.import_description')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                className="mt-3"
                onPress={handleImport}
                disabled={activeFlow !== null}
              >
                <Text>
                  {importingSource === 'money2time'
                    ? I18n.t('data_management.importing')
                    : I18n.t('data_management.import_action')}
                </Text>
              </Button>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View
                  style={[styles.iconContainer, { backgroundColor: `${themeColors.primary}14` }]}
                >
                  <Upload size={18} color={themeColors.primary} />
                </View>
                <View style={styles.sectionTextWrap}>
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('data_management.import_money_manager_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('data_management.import_money_manager_description')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                className="mt-3"
                onPress={handleMoneyManagerImport}
                disabled={activeFlow !== null}
              >
                <Text>
                  {importingSource === 'money_manager'
                    ? I18n.t('data_management.import_money_manager_importing')
                    : I18n.t('data_management.import_money_manager_action')}
                </Text>
              </Button>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconContainer, { backgroundColor: `${themeColors.coral}14` }]}>
                  <Trash2 size={18} color={themeColors.coral} />
                </View>
                <View style={styles.sectionTextWrap}>
                  <Text variant="caption" className="text-foreground">
                    {I18n.t('settings.reset_data_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('data_management.reset_data_description')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                className="mt-3 border-coral/30 bg-coral/8"
                onPress={handleResetAllData}
                disabled={isExporting || activeFlow !== null}
              >
                <Text className="text-destructive">{I18n.t('settings.reset_all_data')}</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <ImportingOverlay
        visible={importingSource !== null}
        title={
          importingSource === 'money_manager'
            ? I18n.t('data_management.import_money_manager_importing')
            : I18n.t('data_management.importing')
        }
      />
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
  section: {
    gap: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTextWrap: {
    flex: 1,
    paddingTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  autoBackupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
