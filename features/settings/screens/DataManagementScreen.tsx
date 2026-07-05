import * as DocumentPicker from 'expo-document-picker';
import { ChevronRight, CloudUpload, Download, Trash2, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
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
import { cn } from '~/utils';

interface DataManagementScreenProps {
  onBack: () => void;
  onOpenAutoBackup?: () => void;
}

type ImportSource = 'money2time' | 'money_manager';

interface DataRowProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  trailingColor: string;
}

function DataRow({
  icon,
  iconColor,
  title,
  description,
  onPress,
  disabled = false,
  busy = false,
  trailingColor,
}: DataRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'flex-row items-center gap-3 rounded-3xl border border-border/50 bg-card px-4 py-4 shadow-soft-lg',
        disabled && 'opacity-50',
      )}
      accessibilityRole="button"
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}14` }]}>{icon}</View>
      <View style={styles.sectionTextWrap}>
        <Text variant="caption" className="text-foreground">
          {title}
        </Text>
        <Text variant="caption" tone="muted" className="mt-0.5">
          {description}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={trailingColor} />
      ) : (
        <ChevronRight size={16} color={trailingColor} />
      )}
    </Pressable>
  );
}

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
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.list}>
          {onOpenAutoBackup ? (
            <DataRow
              icon={<CloudUpload size={18} color={themeColors.primary} />}
              iconColor={themeColors.primary}
              title={I18n.t('auto_backup.entry_title')}
              description={
                settings.autoBackupEnabled
                  ? I18n.t('auto_backup.entry_enabled')
                  : I18n.t('auto_backup.entry_disabled')
              }
              onPress={() => {
                void triggerHaptic('selection');
                onOpenAutoBackup();
              }}
              trailingColor={themeColors.muted}
            />
          ) : null}

          <DataRow
            icon={<Download size={18} color={themeColors.primary} />}
            iconColor={themeColors.primary}
            title={I18n.t('data_management.export_title')}
            description={
              isExporting
                ? I18n.t('data_management.exporting')
                : I18n.t('data_management.export_description')
            }
            onPress={() => void handleExport()}
            disabled={isExporting || activeFlow !== null}
            busy={isExporting}
            trailingColor={themeColors.muted}
          />

          <DataRow
            icon={<Upload size={18} color={themeColors.primary} />}
            iconColor={themeColors.primary}
            title={I18n.t('data_management.import_title')}
            description={I18n.t('data_management.import_description')}
            onPress={handleImport}
            disabled={activeFlow !== null}
            busy={importingSource === 'money2time'}
            trailingColor={themeColors.muted}
          />

          <DataRow
            icon={<Upload size={18} color={themeColors.primary} />}
            iconColor={themeColors.primary}
            title={I18n.t('data_management.import_money_manager_title')}
            description={I18n.t('data_management.import_money_manager_description')}
            onPress={handleMoneyManagerImport}
            disabled={activeFlow !== null}
            busy={importingSource === 'money_manager'}
            trailingColor={themeColors.muted}
          />

          <DataRow
            icon={<Trash2 size={18} color={themeColors.coral} />}
            iconColor={themeColors.coral}
            title={I18n.t('settings.reset_data_title')}
            description={I18n.t('data_management.reset_data_description')}
            onPress={handleResetAllData}
            disabled={isExporting || activeFlow !== null}
            trailingColor={themeColors.coral}
          />
        </View>
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
  list: {
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
  },
});
