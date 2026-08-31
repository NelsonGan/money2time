import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  Card,
  CardContent,
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
  monthCycleDefaultDay,
  monthCycleOf,
  monthCycleOverrideCount,
  MAX_FIRST_DAY_OF_MONTH,
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
 * twelve months of a year sit below it as chips, each showing the day it starts
 * on. The day is the only thing that varies and the only thing you can change,
 * so it is the whole chip: a month that differs is visible from across the
 * grid, with no caption to read. The period a day actually produces is shown
 * where it is being decided, in the picker.
 */
export function MonthCycleScreen({ onBack }: MonthCycleScreenProps) {
  const { settings, updateSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const isDark = useResolvedTheme() === 'dark';
  const chipShadow = useMemo(
    () => ({
      shadowColor: isDark ? '#05070D' : '#1F2530',
      shadowOpacity: isDark ? 0.3 : 0.07,
      shadowRadius: 4,
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

  /** "25 Jan to 24 Feb" for a month key, under the cycle in force. */
  const formatRange = useCallback(
    (monthKey: string) => {
      const { start, endInclusive } = financialMonthRange(monthKey, cycle);
      return I18n.t('settings.month_cycle.range', {
        start: dayMonthFormatter.format(start),
        end: dayMonthFormatter.format(endInclusive),
      });
    },
    [cycle, dayMonthFormatter],
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
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.first_day_of_month')}
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
        <Card>
          <CardContent className="py-4 gap-2.5">
            {/* Label and tooltip sit above the value, like the fields on the
                Display page this is reached from; the value below is the target,
                so the number itself is what you tap. */}
            <View className="flex-row items-center gap-1.5">
              <Text variant="caption" tone="muted">
                {I18n.t('settings.month_cycle.default_row')}
              </Text>
              <InfoTooltipButton
                title={I18n.t('settings.first_day_of_month')}
                infoTooltip={I18n.t('settings.first_day_of_month_help')}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('settings.month_cycle.default_row')}
              accessibilityValue={{ text: String(defaultDay) }}
              onPress={() => {
                void triggerHaptic('selection');
                setEditing({ kind: 'default' });
              }}
              className="h-[54px] flex-row items-center gap-3 rounded-3xl border border-border/40 bg-background/60 px-4"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="monoLg" className="flex-1" style={{ color: themeColors.primary }}>
                {defaultDay}
              </Text>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          </CardContent>
        </Card>

        <View className="mt-7 flex-row items-center justify-center gap-6">
          <YearStep
            label={String(year - 1)}
            disabled={year <= currentYear - YEAR_REACH}
            onPress={() => setYear((value) => value - 1)}
            icon={<ChevronLeft size={18} color={themeColors.textMuted} />}
          />
          <Text variant="subheading" className="tracking-tight">
            {year}
          </Text>
          <YearStep
            label={String(year + 1)}
            disabled={year >= currentYear + YEAR_REACH}
            onPress={() => setYear((value) => value + 1)}
            icon={<ChevronRight size={18} color={themeColors.textMuted} />}
          />
        </View>

        {/* Chips sit straight on the background, like the settings grid: a card
            of cards would flatten them into the surface they stand on. */}
        <View className="mt-4 flex-row flex-wrap" style={{ rowGap: 10 }}>
          {months.map((month) => (
            <View key={month.monthKey} className="w-1/3 px-1">
              <Pressable
                accessibilityRole="button"
                // The day differing is the visible signal; say the state out
                // loud too, or the grid reads as twelve identical chips.
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
                  'items-center gap-1 rounded-3xl border bg-card py-3',
                  month.isCustom ? 'border-primary' : 'border-border/50',
                )}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  // The background these sit on is barely darker than the card,
                  // so without a shadow the chips read as flat cut-outs. Same
                  // neutral lift SettingsGridTile uses, and neutral for the same
                  // reason: a coloured shadow reads as a glow.
                  ...chipShadow,
                })}
              >
                <Text
                  variant="label"
                  tone={month.isCurrent ? 'default' : 'muted'}
                  style={month.isCurrent ? { color: themeColors.primary } : undefined}
                >
                  {month.label}
                </Text>
                <Text
                  variant="monoLg"
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
        // The period the current pick produces, shown where it is being
        // decided. For the default that is this month, which is the one the
        // user is reasoning about when they set a payday.
        rangeLabel={formatRange(editingMonthKey ?? currentMonthKey)}
        dayCount={
          editingMonthKey
            ? daysInMonth(Number(editingMonthKey.slice(0, 4)), Number(editingMonthKey.slice(5)))
            : MAX_FIRST_DAY_OF_MONTH
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
      className="h-9 w-9 items-center justify-center rounded-full"
      style={({ pressed }) => ({ opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}
    >
      {icon}
    </Pressable>
  );
}
