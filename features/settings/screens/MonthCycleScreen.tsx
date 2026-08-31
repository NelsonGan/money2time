import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthCycle } from '~/types';
import {
  financialMonthKeyForDate,
  financialMonthRange,
  firstDayForMonthKey,
  monthCycleDefaultDay,
  monthCycleOf,
  monthCycleOverrideCount,
  serializeMonthCycleOverrides,
  withMonthCycleDefaultDay,
  withMonthCycleOverride,
  withoutMonthCycleOverrides,
} from '~/utils/financialMonth';

import { MonthCycleDaySheet } from '../components/MonthCycleDaySheet';

/** How far either side of this year the year pager will go. */
const YEAR_REACH = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Which picker the sheet is currently editing: the default, or one month. */
type EditTarget = { kind: 'default' } | { kind: 'month'; monthKey: string };

interface MonthCycleScreenProps {
  onBack: () => void;
}

/**
 * "First day of month", as a page rather than a single dropdown.
 *
 * A payday cycle is not always the same date: a month can be pulled forward by
 * a holiday, a bonus, a landlord. So the default day sits at the top and the
 * twelve months of a year sit below it, each showing the period it actually
 * covers and each openable on its own. Every tile spells out its range instead
 * of only its start day, because the thing a user is really choosing is which
 * spending lands in which month, and the range is that answer.
 */
export function MonthCycleScreen({ onBack }: MonthCycleScreenProps) {
  const { settings, updateSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const cycle = monthCycleOf(settings);
  const defaultDay = monthCycleDefaultDay(cycle);
  const overrideCount = monthCycleOverrideCount(cycle);
  const locale = settings.locale ?? I18n.locale ?? 'en';

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const dayMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    [locale],
  );
  const shortMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short' }),
    [locale],
  );
  const longMonthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );

  const formatRange = useCallback(
    (monthKey: string, forCycle: MonthCycle) => {
      const { start, endInclusive } = financialMonthRange(monthKey, forCycle);
      return I18n.t('settings.month_cycle.range', {
        start: dayMonthFormatter.format(start),
        end: dayMonthFormatter.format(endInclusive),
      });
    },
    [dayMonthFormatter],
  );

  const applyCycle = useCallback(
    (next: MonthCycle) => {
      updateSettings({
        firstDayOfMonth: next.defaultDay,
        firstDayOverridesJson: serializeMonthCycleOverrides(next.overrides),
      });
    },
    [updateSettings],
  );

  const currentMonthKey = financialMonthKeyForDate(today, cycle);

  /** The cycle the user is inside right now, spelled out for the hero card. */
  const currentPeriod = useMemo(() => {
    const { start, endInclusive } = financialMonthRange(currentMonthKey, cycle);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // Both ends are local midnight, so a plain millisecond division is exact
    // and does not need DST-safe day walking.
    const totalDays = Math.round((endInclusive.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    const dayOfPeriod = Math.round((startOfToday.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    return {
      label: formatRange(currentMonthKey, cycle),
      totalDays,
      dayOfPeriod,
    };
  }, [currentMonthKey, cycle, formatRange, today]);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
        return {
          monthKey,
          label: shortMonthFormatter.format(new Date(year, index, 1)),
          range: formatRange(monthKey, cycle),
          isCustom: cycle.overrides[monthKey] !== undefined,
          isCurrent: monthKey === currentMonthKey,
        };
      }),
    [year, shortMonthFormatter, formatRange, cycle, currentMonthKey],
  );

  const handleReset = useCallback(() => {
    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('settings.month_cycle.reset_confirm_title'),
      I18n.t('settings.month_cycle.reset_confirm_message', { day: defaultDay }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('settings.month_cycle.reset'),
          style: 'destructive',
          onPress: () => applyCycle(withoutMonthCycleOverrides(cycle)),
        },
      ],
    );
  }, [applyCycle, cycle, defaultDay]);

  const editingMonthKey = editing?.kind === 'month' ? editing.monthKey : null;

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.first_day_of_month')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <Card>
          <CardContent className="py-5 gap-1">
            <Text variant="caption" tone="muted">
              {I18n.t('settings.month_cycle.current_period')}
            </Text>
            <Text variant="subheading" className="tracking-tight">
              {currentPeriod.label}
            </Text>
            <Text variant="caption" tone="muted">
              {I18n.t('settings.month_cycle.day_of', {
                day: currentPeriod.dayOfPeriod,
                total: currentPeriod.totalDays,
              })}
            </Text>
          </CardContent>
        </Card>

        <SettingsSection title={I18n.t('settings.month_cycle.default_title')}>
          <Card>
            <CardContent className="py-4 gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t('settings.month_cycle.default_row')}
                accessibilityValue={{ text: String(defaultDay) }}
                onPress={() => {
                  void triggerHaptic('selection');
                  setEditing({ kind: 'default' });
                }}
                style={styles.defaultRow}
              >
                <Text variant="body" className="flex-1">
                  {I18n.t('settings.month_cycle.default_row')}
                </Text>
                <Text variant="body" tone="muted">
                  {defaultDay}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
              <Text variant="caption" tone="muted">
                {I18n.t('settings.month_cycle.default_help')}
              </Text>
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection
          title={I18n.t('settings.month_cycle.months_title')}
          subtitle={
            overrideCount > 0
              ? I18n.t(
                  overrideCount === 1
                    ? 'settings.month_cycle.customized_count_one'
                    : 'settings.month_cycle.customized_count_other',
                  { count: overrideCount },
                )
              : I18n.t('settings.month_cycle.all_default')
          }
        >
          <Card>
            <CardContent className="py-4 gap-3">
              <View style={styles.yearRow}>
                <YearStepButton
                  label={String(year - 1)}
                  disabled={year <= currentYear - YEAR_REACH}
                  onPress={() => setYear((value) => value - 1)}
                  icon={<ChevronLeft size={18} color={themeColors.textMuted} />}
                />
                <Text variant="subheading" className="tracking-tight">
                  {year}
                </Text>
                <YearStepButton
                  label={String(year + 1)}
                  disabled={year >= currentYear + YEAR_REACH}
                  onPress={() => setYear((value) => value + 1)}
                  icon={<ChevronRight size={18} color={themeColors.textMuted} />}
                />
              </View>

              <View style={styles.grid}>
                {months.map((month) => (
                  <View key={month.monthKey} style={styles.cell}>
                    <Pressable
                      accessibilityRole="button"
                      // The custom/current states are colour and a pill; say
                      // them too, or the grid reads as twelve identical rows.
                      accessibilityLabel={[
                        month.label,
                        month.range,
                        month.isCustom ? I18n.t('settings.month_cycle.custom') : null,
                        month.isCurrent ? I18n.t('settings.month_cycle.now') : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      onPress={() => {
                        void triggerHaptic('selection');
                        setEditing({ kind: 'month', monthKey: month.monthKey });
                      }}
                      style={[
                        styles.monthTile,
                        {
                          borderColor: month.isCustom
                            ? themeColors.primary
                            : month.isCurrent
                              ? themeColors.border
                              : 'transparent',
                          backgroundColor: month.isCustom
                            ? themeColors.primarySoft
                            : themeColors.surfaceMuted,
                        },
                      ]}
                    >
                      <View style={styles.monthTileHeader}>
                        <Text variant="label" className="uppercase tracking-wider">
                          {month.label}
                        </Text>
                        {/* One slot, two states. "Now" wins when a month is
                            both, since orienting the reader matters more and
                            the tile's own tint still marks it customized. */}
                        {month.isCurrent || month.isCustom ? (
                          <Text variant="caption" style={{ color: themeColors.primary }}>
                            {I18n.t(
                              month.isCurrent
                                ? 'settings.month_cycle.now'
                                : 'settings.month_cycle.custom',
                            )}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {month.range}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        </SettingsSection>

        {overrideCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleReset}
            style={styles.resetRow}
            className="mt-5"
          >
            <RotateCcw size={15} color={themeColors.error} />
            <Text variant="body" style={{ color: themeColors.error }}>
              {I18n.t('settings.month_cycle.reset')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <MonthCycleDaySheet
        visible={editing !== null}
        title={
          editingMonthKey
            ? I18n.t('settings.month_cycle.sheet_month', {
                month: longMonthFormatter.format(
                  new Date(
                    Number(editingMonthKey.slice(0, 4)),
                    Number(editingMonthKey.slice(5)) - 1,
                    1,
                  ),
                ),
              })
            : I18n.t('settings.month_cycle.sheet_default')
        }
        selectedDay={editingMonthKey ? firstDayForMonthKey(cycle, editingMonthKey) : defaultDay}
        defaultDay={editingMonthKey ? defaultDay : null}
        followsDefault={editingMonthKey ? cycle.overrides[editingMonthKey] === undefined : false}
        onSelect={(day) => {
          applyCycle(
            editingMonthKey
              ? withMonthCycleOverride(cycle, editingMonthKey, day)
              : withMonthCycleDefaultDay(cycle, day),
          );
          setEditing(null);
        }}
        onUseDefault={() => {
          if (editingMonthKey) applyCycle(withMonthCycleOverride(cycle, editingMonthKey, null));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </SettingsPageLayout>
  );
}

function YearStepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      style={[styles.yearStep, disabled && styles.yearStepDisabled]}
    >
      {icon}
    </Pressable>
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
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  yearStep: {
    height: 34,
    width: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearStepDisabled: {
    opacity: 0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  cell: {
    // Two columns, rounded down so float error can't drop a tile onto its own
    // row (the same trap the app-icon grid documents at three columns).
    width: '50%',
  },
  monthTile: {
    marginHorizontal: spacing.xxs,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  monthTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
});
