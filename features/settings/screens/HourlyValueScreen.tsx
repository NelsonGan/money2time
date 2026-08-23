import { Settings2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import {
  AddIconButton,
  Button,
  SelectField,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  type HourlyTimelineRow,
  HourlyValueTimeline,
} from '~/features/settings/components/HourlyValueTimeline';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthlyWageSettings, WageConfig } from '~/types';
import { financialMonthKeyForDate } from '~/utils/financialMonth';
import { normalizeMonthKey } from '~/utils/formatters';

interface HourlyValueScreenProps {
  onClose: () => void;
  onOpenWageCalculator: (params: { monthKey: string; initialConfig: WageConfig }) => void;
  onOpenAddWageMonth: () => void;
  onOpenSettings: () => void;
}

type DisplayPeriod = 'hourly' | 'weekly' | 'monthly' | 'yearly';

const WEEKS_PER_MONTH = 4.33;
const WEEKS_PER_YEAR = 52;
const FLOATING_ADD_SIZE = 60;
const FLOATING_ADD_BOTTOM_GAP = spacing.md;
const HOURLY_LIST_BOTTOM_PADDING =
  SETTINGS_LIST_BOTTOM_PADDING + FLOATING_ADD_SIZE + FLOATING_ADD_BOTTOM_GAP;

/**
 * Weekly take-home is the same number whether derived from the true or base rate,
 * so weekly/monthly/yearly all scale a single weekly income figure.
 */
function periodValueForEntry(item: MonthlyWageSettings, period: DisplayPeriod): number {
  if (period === 'hourly') return item.trueHourlyRate;
  const weeklyIncome = item.baseHourlyRate * item.hoursWorkedPerWeek;
  switch (period) {
    case 'weekly':
      return weeklyIncome;
    case 'monthly':
      return weeklyIncome * WEEKS_PER_MONTH;
    case 'yearly':
      return weeklyIncome * WEEKS_PER_YEAR;
  }
}

const PERIOD_SUFFIX_KEY: Record<DisplayPeriod, string> = {
  hourly: 'settings.hourly_suffix_hourly',
  weekly: 'settings.hourly_suffix_weekly',
  monthly: 'settings.hourly_suffix_monthly',
  yearly: 'settings.hourly_suffix_yearly',
};

const PERIOD_NOW_LABEL_KEY: Record<DisplayPeriod, string> = {
  hourly: 'settings.hourly_now_label',
  weekly: 'settings.hourly_now_weekly',
  monthly: 'settings.hourly_now_monthly',
  yearly: 'settings.hourly_now_yearly',
};

const HISTORY_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: HOURLY_LIST_BOTTOM_PADDING,
} as const;

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listEmptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  addSheetContent: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  addSheetPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addSheetConfirmRow: {
    marginTop: spacing.md,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodSelect: {
    width: 150,
  },
  floatingAddButtonContainer: {
    position: 'absolute',
    right: SETTINGS_HORIZONTAL_PADDING,
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
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

export function HourlyValueScreen({
  onClose,
  onOpenWageCalculator,
  onOpenAddWageMonth,
  onOpenSettings,
}: HourlyValueScreenProps) {
  const { settings, monthlyWages, deleteWageConfigForMonth } = useApp();
  const bottomNavInset = useSettingsBottomNavInset(HOURLY_LIST_BOTTOM_PADDING);
  const bottomNavContentInset = useBottomNavContentInset();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [displayPeriod, setDisplayPeriod] = useState<DisplayPeriod>('hourly');

  const currentMonthKey = useMemo(
    () => financialMonthKeyForDate(new Date(), settings.firstDayOfMonth),
    [settings.firstDayOfMonth],
  );

  const normalizedHistory = useMemo(() => normalizeAndDedupeHistory(monthlyWages), [monthlyWages]);

  const historyAsc = useMemo(
    () => [...normalizedHistory].sort((a, b) => a.month.localeCompare(b.month)),
    [normalizedHistory],
  );

  const timelineRows = useMemo<HourlyTimelineRow[]>(() => {
    const ascRows = historyAsc.map((item, index) => {
      const rate = periodValueForEntry(item, displayPeriod);
      const prevRate =
        index === 0 ? null : periodValueForEntry(historyAsc[index - 1], displayPeriod);
      return {
        item,
        monthLabel: formatMonthLabel(item.month, activeLocale),
        rate,
        delta: prevRate === null ? null : rate - prevRate,
        isCurrentMonth: item.month === currentMonthKey,
      };
    });
    return ascRows.reverse();
  }, [activeLocale, currentMonthKey, displayPeriod, historyAsc]);

  const sparklineValues = useMemo(
    () => historyAsc.map((item) => periodValueForEntry(item, displayPeriod)),
    [displayPeriod, historyAsc],
  );

  const periodOptions = useMemo(
    () => [
      { value: 'hourly', label: I18n.t('settings.hourly_period_hourly') },
      { value: 'weekly', label: I18n.t('settings.hourly_period_weekly') },
      { value: 'monthly', label: I18n.t('settings.hourly_period_monthly') },
      { value: 'yearly', label: I18n.t('settings.hourly_period_yearly') },
    ],
    [],
  );

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

  const handleAddWageMonth = useCallback(() => {
    if (!checkLimit('wage_entries', monthlyWages.length)) return;
    onOpenAddWageMonth();
  }, [checkLimit, monthlyWages.length, onOpenAddWageMonth]);

  return (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={I18n.t('settings.hourly_value')}
          infoTooltip={I18n.t('settings.manage_formulas')}
          rightAccessory={
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenSettings();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('settings.time_display')}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <Settings2 size={18} color={themeColors.textMuted} />
            </Pressable>
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={[HISTORY_LIST_CONTENT_STYLE, bottomNavInset]}
        showsVerticalScrollIndicator={false}
      >
        {timelineRows.length > 0 ? (
          <>
            <View style={styles.periodRow}>
              <Text variant="label" tone="muted">
                {I18n.t('settings.hourly_show_as')}
              </Text>
              <View style={styles.periodSelect}>
                <SelectField
                  triggerSize="header"
                  sheetTitle={I18n.t('settings.hourly_show_as')}
                  value={displayPeriod}
                  options={periodOptions}
                  onChange={(value) => setDisplayPeriod(value as DisplayPeriod)}
                />
              </View>
            </View>
            <HourlyValueTimeline
              rows={timelineRows}
              sparklineValues={sparklineValues}
              currencySymbol={settings.currencySymbol}
              themeColors={themeColors}
              rateSuffix={I18n.t(PERIOD_SUFFIX_KEY[displayPeriod])}
              nowLabel={I18n.t(PERIOD_NOW_LABEL_KEY[displayPeriod])}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
            />
          </>
        ) : (
          <View style={styles.listEmptyContainer}>
            <Text variant="friendly" tone="muted">
              {I18n.t('settings.hourly_history_empty')}
            </Text>
          </View>
        )}
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[
          styles.floatingAddButtonContainer,
          { bottom: bottomNavContentInset + FLOATING_ADD_BOTTOM_GAP },
        ]}
      >
        <AddIconButton
          size={FLOATING_ADD_SIZE}
          haptic="medium"
          accessibilityLabel={I18n.t('settings.hourly_add_title')}
          onPress={handleAddWageMonth}
        />
      </View>
    </SettingsPageLayout>
  );
}

/** Full-page "add a wage month" picker (native-stack screen). */
export function AddWageMonthScreen({
  onClose,
  onOpenWageCalculator,
}: {
  onClose: () => void;
  onOpenWageCalculator: (params: { monthKey: string; initialConfig: WageConfig }) => void;
}) {
  const { settings, monthlyWages } = useApp();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [pickerYear, setPickerYear] = useState(() => String(new Date().getFullYear()));
  const [pickerMonth, setPickerMonth] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0'),
  );

  const monthOptions = useMemo(() => buildMonthOptions(activeLocale), [activeLocale]);
  const normalizedHistory = useMemo(() => normalizeAndDedupeHistory(monthlyWages), [monthlyWages]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const fromRange = Array.from({ length: 9 }, (_, i) => String(currentYear - 5 + i));
    const fromData = Array.from(new Set(normalizedHistory.map((item) => item.month.slice(0, 4))));
    return Array.from(new Set([...fromRange, ...fromData, pickerYear])).sort(
      (a, b) => Number(b) - Number(a),
    );
  }, [normalizedHistory, pickerYear]);

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
            onPress: () =>
              onOpenWageCalculator({
                monthKey: existing.month,
                initialConfig: {
                  wageType: existing.wageType,
                  wageAmount: existing.wageAmount,
                  hoursWorkedPerWeek: existing.hoursWorkedPerWeek,
                  workdaysPerWeek: existing.workdaysPerWeek,
                  commuteMinutesPerWorkday: existing.commuteMinutesPerWorkday,
                },
              }),
          },
        ],
      );
      return;
    }
    onOpenWageCalculator({ monthKey, initialConfig: DEFAULT_WAGE_CONFIG });
  }, [activeLocale, normalizedHistory, onOpenWageCalculator, pickerMonth, pickerYear]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        title={I18n.t('settings.hourly_add_title')}
        onBack={onClose}
      />
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
  );
}
