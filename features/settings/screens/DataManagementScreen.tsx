import { Download, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { exportDatabase, pickAndImportDatabase } from '~/services/dataManagementService';

interface DataManagementScreenProps {
  onBack: () => void;
}

export function DataManagementScreen({ onBack }: DataManagementScreenProps) {
  const { refreshAll } = useApp();
  const themeColors = useThemeColors();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
    setIsImporting(true);
    try {
      const result = await pickAndImportDatabase();
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
      setIsImporting(false);
    }
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
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
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
                disabled={isExporting}
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
                disabled={isImporting}
              >
                <Text>
                  {isImporting
                    ? I18n.t('data_management.importing')
                    : I18n.t('data_management.import_action')}
                </Text>
              </Button>
            </View>
          </CardContent>
        </Card>

        <View style={styles.warningSection}>
          <Text variant="caption" tone="muted" className="px-1">
            {I18n.t('data_management.import_warning')}
          </Text>
        </View>
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
  warningSection: {
    marginTop: 20,
  },
});
