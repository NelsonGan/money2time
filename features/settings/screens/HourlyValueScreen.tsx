import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, type ListRenderItem, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  SelectField,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
} from '~/components/ui';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthlyWageSettings, WageConfig } from '~/types';
import { monthKeyFromDateLocal, normalizeMonthKey } from '~/utils/formatters';

interface HourlyValueScreenProps {
  onClose: () => void;
  onOpenWageCalculator: (params: { monthKey: string; initialConfig: WageConfig }) => void;
}

const HISTORY_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
} as const;

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  rowActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSheetHeader: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addSheetCancelButton: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  addSheetContent: {
    paddingHorizontal: spacing.screenHorizontal,
    gap: spacing.sm,
  },
  addSheetPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addSheetConfirmRow: {
    marginTop: spacing.md,
  },
});

function normalizeAndDedupeHistory(history: MonthlyWageSettings[]) {
  const byMonth = new Map<string, MonthlyWageSettings>();
  history.forEach((item) => {
    const normalizedMonth = normalizeMonthKey(item.month);
    const normalizedItem =
      normalizedMonth === item.month ? item : { ...item, month: normalizedMonth };
    const existing = byMonth.get(normalizedMonth);
    if (!existing || normalizedItem.updatedAt > existing.updatedAt) {
      byMonth.set(normalizedMonth, normalizedItem);
    }
  });
  return Array.from(byMonth.values());
}

function buildMonthOptions(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    const label = formatter.format(new Date(2024, index, 1));
    return { value, label };
  });
}

function formatMonthLabel(monthKey: string, locale: string) {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const [yearRaw, monthRaw] = normalizedMonth.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return normalizedMonth;
  if (month < 1 || month > 12) return normalizedMonth;
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

export function HourlyValueScreen({ onClose, onOpenWageCalculator }: HourlyValueScreenProps) {
  const { settings, monthlyWages, deleteWageConfigForMonth } = useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [showAddModal, setShowAddModal] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => String(new Date().getFullYear()));
  const [pickerMonth, setPickerMonth] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0'),
  );

  const currentMonthKey = useMemo(() => monthKeyFromDateLocal(new Date()), []);
  const monthOptions = useMemo(() => buildMonthOptions(activeLocale), [activeLocale]);

  const normalizedHistory = useMemo(() => normalizeAndDedupeHistory(monthlyWages), [monthlyWages]);

  const historyDesc = useMemo(
    () => [...normalizedHistory].sort((a, b) => b.month.localeCompare(a.month)),
    [normalizedHistory],
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const fromRange = Array.from({ length: 9 }, (_, i) => String(currentYear - 5 + i));
    const fromData = Array.from(new Set(normalizedHistory.map((item) => item.month.slice(0, 4))));
    return Array.from(new Set([...fromRange, ...fromData, pickerYear])).sort(
      (a, b) => Number(b) - Number(a),
    );
  }, [normalizedHistory, pickerYear]);

  const handleEditEntry = useCallback(
    (item: MonthlyWageSettings) => {
      void triggerHaptic('selection');
      onOpenWageCalculator({
        monthKey: item.month,
        initialConfig: {
          wageType: item.wageType,
          wageAmount: item.wageAmount,
          hoursWorkedPerWeek: item.hoursWorkedPerWeek,
          workdaysPerWeek: item.workdaysPerWeek,
          commuteMinutesPerWorkday: item.commuteMinutesPerWorkday,
        },
      });
    },
    [onOpenWageCalculator],
  );

  const handleDeleteEntry = useCallback(
    (item: MonthlyWageSettings) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('settings.hourly_delete_title'),
        I18n.t('settings.hourly_delete_message', {
          month: formatMonthLabel(item.month, activeLocale),
        }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.delete'),
            style: 'destructive',
            onPress: () => {
              void triggerHaptic('warning');
              deleteWageConfigForMonth(item.month);
            },
          },
        ],
      );
    },
    [activeLocale, deleteWageConfigForMonth],
  );

  const handleAddConfirm = useCallback(() => {
    const monthKey = normalizeMonthKey(`${pickerYear}-${pickerMonth}`);
    const existing = normalizedHistory.find((item) => item.month === monthKey);
    if (existing) {
      Alert.alert(
        I18n.t('settings.hourly_month_exists_title', {
          month: formatMonthLabel(monthKey, activeLocale),
        }),
        I18n.t('settings.hourly_month_exists_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.edit'),
            onPress: () => {
              setShowAddModal(false);
              handleEditEntry(existing);
            },
          },
        ],
      );
      return;
    }
    setShowAddModal(false);
    onOpenWageCalculator({ monthKey, initialConfig: DEFAULT_WAGE_CONFIG });
  }, [
    activeLocale,
    handleEditEntry,
    normalizedHistory,
    onOpenWageCalculator,
    pickerMonth,
    pickerYear,
  ]);

  const keyExtractor = useCallback((item: MonthlyWageSettings) => item.id, []);

  const renderHistoryItem = useCallback<ListRenderItem<MonthlyWageSettings>>(
    ({ item }) => {
      const isCurrentMonth = item.month === currentMonthKey;
      return (
        <View
          className={`flex-row items-center gap-2.5 mb-2 rounded-2xl border px-3.5 py-3 ${
            isCurrentMonth ? 'border-success/35 bg-success/8' : 'border-border/35 bg-card'
          }`}
        >
          <View className="flex-1 gap-0.5">
            <Text variant="caption">{formatMonthLabel(item.month, activeLocale)}</Text>
            {isCurrentMonth ? (
              <Text variant="label" className="text-success">
                {I18n.t('settings.hourly_badge_current')}
              </Text>
            ) : null}
            <Text variant="subheading" className="text-primary mt-1">
              {settings.currencySymbol}
              {item.trueHourlyRate.toFixed(2)}/hr
            </Text>
          </View>
          <Pressable
            onPress={() => handleEditEntry(item)}
            className="h-9 w-9 rounded-full items-center justify-center border border-border/40 bg-secondary"
            style={styles.rowActionButton}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.edit')}
            hitSlop={8}
          >
            <Pencil size={14} color={themeColors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => handleDeleteEntry(item)}
            className="h-9 w-9 rounded-full items-center justify-center border border-destructive/20 bg-destructive/10"
            style={styles.rowActionButton}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.delete')}
            hitSlop={8}
          >
            <Trash2 size={14} color={themeColors.coral} />
          </Pressable>
        </View>
      );
    },
    [
      currentMonthKey,
      handleDeleteEntry,
      handleEditEntry,
      activeLocale,
      settings.currencySymbol,
      themeColors.coral,
      themeColors.textMuted,
    ],
  );

  return (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={I18n.t('settings.hourly_value')}
          subtitle={I18n.t('settings.manage_formulas')}
          rightAccessory={
            <Button
              size="icon"
              haptic="none"
              onPress={() => {
                if (!checkLimit('wage_entries', monthlyWages.length)) return;
                void triggerHaptic('selection');
                setShowAddModal(true);
              }}
            >
              <Plus size={18} color="#fff" />
            </Button>
          }
        />
      </View>

      <FlatList
        data={historyDesc}
        keyExtractor={keyExtractor}
        contentContainerStyle={HISTORY_LIST_CONTENT_STYLE}
        renderItem={renderHistoryItem}
        ListEmptyComponent={
          <View style={styles.listEmptyContainer}>
            <Text variant="friendly" tone="muted">
              {I18n.t('settings.hourly_history_empty')}
            </Text>
          </View>
        }
      />

      <ThemeModal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View style={styles.addSheetHeader}>
            <Text variant="subheading">{I18n.t('settings.hourly_add_title')}</Text>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setShowAddModal(false);
              }}
              className="bg-secondary"
              style={styles.addSheetCancelButton}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.cancel')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.addSheetContent}>
            <View style={styles.addSheetPickerRow}>
              <View className="flex-1">
                <SelectField
                  label={I18n.t('settings.year')}
                  value={pickerYear}
                  onChange={setPickerYear}
                  options={yearOptions.map((year) => ({ value: year, label: year }))}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label={I18n.t('settings.month')}
                  value={pickerMonth}
                  onChange={setPickerMonth}
                  options={monthOptions}
                />
              </View>
            </View>
            <View style={styles.addSheetConfirmRow}>
              <Button onPress={handleAddConfirm}>
                <Text>{I18n.t('settings.hourly_add_confirm')}</Text>
              </Button>
            </View>
          </View>
        </SafeAreaView>
      </ThemeModal>
    </SettingsPageLayout>
  );
}
