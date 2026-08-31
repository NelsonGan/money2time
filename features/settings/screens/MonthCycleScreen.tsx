import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  InfoTooltipButton,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { MonthCycle } from '~/types';
import { cn } from '~/utils';
import {
  daysInMonth,
  financialMonthKeyForDate,
  financialMonthRange,
  firstDayForMonthKey,
  MAX_FIRST_DAY_OF_MONTH,
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
 * twelve months of a year sit below it as tiles, each showing the day it starts
 * on. The day is the only thing that varies and the only thing you can change,
 * so it is the whole tile: a month that differs is visible from across the grid,
 * with no caption to read. The period a day actually produces is shown where it
 * is being decided, in the picker.
 */
export function MonthCycleScreen({ onBack }: MonthCycleScreenProps) {
  const { settings, updateSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';

  // The month tiles ride the app's fat-button ledge: a chunky bottom border in
  // a theme-matched tint plus a soft neutral lift, exactly as SettingsGridTile
  // does, so they read as this app's tiles rather than generic cards.
  const tileShadow = useMemo(
    () => ({
      shadowColor: isDark ? '#05070D' : '#1F2530',
      shadowOpacity: isDark ? 0.3 : 0.07,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    }),
    [isDark],
  );

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
  const editingMonthKey = editing?.kind === 'month' ? editing.monthKey : null;

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
        return {
          monthKey,
          label: shortMonthFormatter.format(new Date(year, index, 1)),
          day: firstDayForMonthKey(cycle, monthKey),
          isCustom: cycle.overrides[monthKey] !== undefined,
          isCurrent: monthKey === currentMonthKey,
        };
      }),
    [year, shortMonthFormatter, cycle, currentMonthKey],
  );

  /** Both ends of the cycle a candidate day would produce, for the picker. */
  const previewRange = useCallback(
    (day: number) => {
      const draft = editingMonthKey
        ? withMonthCycleOverride(cycle, editingMonthKey, day)
        : withMonthCycleDefaultDay(cycle, day);
      const { start, endInclusive } = financialMonthRange(
        editingMonthKey ?? currentMonthKey,
        draft,
      );
      return {
        from: dayMonthFormatter.format(start),
        until: dayMonthFormatter.format(endInclusive),
      };
    },
    [cycle, currentMonthKey, dayMonthFormatter, editingMonthKey],
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

  return (
    <SettingsPageLayout>
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.month_cycle.title')}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={[
          {
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          },
          bottomNavInset,
        ]}
      >
        <View className="flex-row items-center gap-1.5 px-1">
          <Text variant="label" tone="muted">
            {I18n.t('settings.month_cycle.default_title')}
          </Text>
          <InfoTooltipButton
            title={I18n.t('settings.first_day_of_month')}
            infoTooltip={I18n.t('settings.first_day_of_month_help')}
          />
        </View>

        {/* The day leads as a chip, the way the tiles below carry theirs, so
            the default reads as one of the same things rather than a settings
            row that happens to sit above them. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('settings.month_cycle.default_row')}
          accessibilityValue={{ text: String(defaultDay) }}
          onPress={() => {
            void triggerHaptic('selection');
            setEditing({ kind: 'default' });
          }}
          className="mt-2 flex-row items-center gap-3.5 rounded-3xl border border-border/50 bg-card p-4"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, ...tileShadow })}
        >
          <View className="h-[46px] w-[46px] items-center justify-center rounded-2xl bg-primary/10">
            <Text variant="mono" className="text-[17px]" style={{ color: themeColors.primary }}>
              {defaultDay}
            </Text>
          </View>
          <Text variant="bodyStrong" className="flex-1 tracking-tight">
            {I18n.t('settings.month_cycle.default_row')}
          </Text>
          <ChevronRight size={20} color={themeColors.textMuted} />
        </Pressable>

        <View className="mt-6 flex-row items-center gap-2.5 px-1">
          <YearStep
            label={String(year - 1)}
            disabled={year <= currentYear - YEAR_REACH}
            onPress={() => setYear((value) => value - 1)}
            icon={<ChevronLeft size={16} color={themeColors.textMuted} />}
          />
          <Text variant="friendly" className="flex-1 text-center font-extrabold tracking-tight">
            {year}
          </Text>
          <YearStep
            label={String(year + 1)}
            disabled={year >= currentYear + YEAR_REACH}
            onPress={() => setYear((value) => value + 1)}
            icon={<ChevronRight size={16} color={themeColors.textMuted} />}
          />
        </View>

        {/* -mx-1 cancels the per-cell gutter so the outer tiles line up flush
            with the card above them. */}
        <View className="mt-2.5 -mx-1 flex-row flex-wrap" style={{ rowGap: 9 }}>
          {months.map((month) => (
            <View key={month.monthKey} className="w-1/3 px-1">
              <Pressable
                accessibilityRole="button"
                // The day differing is the visible signal; say the state out
                // loud too, or the grid reads as twelve identical tiles.
                accessibilityLabel={[
                  month.label,
                  String(month.day),
                  month.isCustom ? I18n.t('settings.month_cycle.custom') : null,
                  month.isCurrent ? I18n.t('settings.month_cycle.now') : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() => {
                  void triggerHaptic('selection');
                  setEditing({ kind: 'month', monthKey: month.monthKey });
                }}
                className={cn(
                  'h-[84px] items-center justify-center rounded-3xl border border-b-[5px] bg-card',
                  month.isCustom ? 'border-primary/40' : 'border-border/60',
                )}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, ...tileShadow })}
              >
                <Text
                  variant="caption"
                  className="text-[12px]"
                  style={month.isCurrent ? { color: themeColors.primary } : undefined}
                >
                  {month.label}
                </Text>
                <Text
                  variant="monoLg"
                  tone={month.isCustom ? 'default' : 'muted'}
                  className={cn('mt-0.5', !month.isCustom && 'font-medium')}
                  style={month.isCustom ? { color: themeColors.primary } : undefined}
                >
                  {month.day}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {overrideCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleReset}
            className="mt-6 flex-row items-center justify-center gap-2 py-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
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
            ? longMonthFormatter.format(
                new Date(
                  Number(editingMonthKey.slice(0, 4)),
                  Number(editingMonthKey.slice(5)) - 1,
                  1,
                ),
              )
            : I18n.t('settings.month_cycle.sheet_default')
        }
        dayCount={
          editingMonthKey
            ? daysInMonth(Number(editingMonthKey.slice(0, 4)), Number(editingMonthKey.slice(5)))
            : MAX_FIRST_DAY_OF_MONTH
        }
        selectedDay={editingMonthKey ? firstDayForMonthKey(cycle, editingMonthKey) : defaultDay}
        defaultDay={editingMonthKey ? defaultDay : null}
        previewRange={previewRange}
        onSave={(day) => {
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

function YearStep({
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
      className="h-[30px] w-[30px] items-center justify-center rounded-full bg-muted"
      style={({ pressed }) => ({ opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      {icon}
    </Pressable>
  );
}
