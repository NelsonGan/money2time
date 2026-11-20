import { Settings2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ColumnCornerView } from '~/components/layout/ColumnGutter';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import {
  AddIconButton,
  SelectField,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import {
  type HourlyTimelineRow,
  HourlyValueTimeline,
} from '~/features/settings/components/HourlyValueTimeline';
import { formatMonthLabel } from '~/features/settings/lib/wageMonths';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthlyWageSettings } from '~/types';
import { financialMonthKeyForDate, monthCycleOf } from '~/utils/financialMonth';

interface HourlyValueScreenProps {
  onClose: () => void;
  /** Opens the one-page wage editor on a month, or on a new month without one. */
  onOpenWageEditor: (monthKey?: string) => void;
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

export function HourlyValueScreen({
  onClose,
  onOpenWageEditor,
  onOpenSettings,
}: HourlyValueScreenProps) {
  const { settings, monthlyWages, deleteWageConfigForMonth } = useApp();
  const monthCycle = monthCycleOf(settings);
  const bottomNavInset = useSettingsBottomNavInset(HOURLY_LIST_BOTTOM_PADDING);
  const bottomNavContentInset = useBottomNavContentInset();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const [displayPeriod, setDisplayPeriod] = useState<DisplayPeriod>('hourly');

  const currentMonthKey = useMemo(
    () => financialMonthKeyForDate(new Date(), monthCycle),
    [monthCycle],
  );

  const historyAsc = useMemo(
    () => [...monthlyWages].sort((a, b) => a.month.localeCompare(b.month)),
    [monthlyWages],
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
      onOpenWageEditor(item.month);
    },
    [onOpenWageEditor],
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
    onOpenWageEditor();
  }, [checkLimit, monthlyWages.length, onOpenWageEditor]);

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

      <ColumnCornerView
        // iPad: in the window's corner, not over the column's rows.
        right={SETTINGS_HORIZONTAL_PADDING}
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
      </ColumnCornerView>
    </SettingsPageLayout>
  );
}
