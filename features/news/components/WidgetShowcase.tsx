import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownRight, ArrowUpRight, Clock, Minus, Plus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { buildSampleWidgetSnapshot } from '~/services/widgetSnapshot.shared';
import { FONT } from '~/utils/fonts';

export type WidgetShowcaseKind = 'monthly' | 'weekly' | 'calendar';

const BANNER_SOURCE = require('../../../assets/banner.png');

const RATIO: Record<WidgetShowcaseKind, number> = {
  monthly: 338 / 158,
  weekly: 338 / 158,
  calendar: 338 / 354,
};

const WIDGET_PADDING = 16;
const GRID_GAP = 4;

function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function Banner({ width = 112 }: { width?: number }) {
  return (
    <Image
      source={BANNER_SOURCE}
      contentFit="contain"
      contentPosition="left center"
      style={{ width, height: width * 0.27 }}
    />
  );
}

function ProRibbon() {
  const themeColors = useThemeColors();
  return (
    <View style={[styles.ribbon, { backgroundColor: themeColors.accent }]} pointerEvents="none">
      <Text allowFontScaling={false} style={styles.ribbonText}>
        PRO
      </Text>
    </View>
  );
}

function ActionPill({ tone }: { tone: 'income' | 'expense' }) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const accent = isIncome ? themeColors.success : themeColors.error;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: withColorAlpha(accent, 0.11),
          borderColor: withColorAlpha(accent, 0.26),
        },
      ]}
    >
      <View style={[styles.pillBadge, { backgroundColor: accent }]}>
        {isIncome ? (
          <Plus size={14} color="#fff" strokeWidth={3.2} />
        ) : (
          <Minus size={14} color="#fff" strokeWidth={3.2} />
        )}
      </View>
      <Text variant="caption" style={[styles.pillLabel, { color: accent }]}>
        {isIncome ? 'Income' : 'Expense'}
      </Text>
    </View>
  );
}

function MonthlyContent({ snapshot }: { snapshot: ReturnType<typeof buildSampleWidgetSnapshot> }) {
  const themeColors = useThemeColors();
  const data = snapshot.monthlyExpenseQuickLog;
  return (
    <View style={styles.pad}>
      <Banner />
      <View style={styles.monthlyBody}>
        <View style={styles.flexMin}>
          <Text variant="label" tone="muted" style={styles.eyebrow}>
            This month
          </Text>
          <Text
            style={[styles.bigAmount, { color: themeColors.error }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {data.expenseLabel}
          </Text>
          <View style={styles.timeRow}>
            <Clock size={12} color={themeColors.primary} strokeWidth={2.4} />
            <Text variant="caption" style={{ color: themeColors.textSoft }} numberOfLines={1}>
              {data.timeEquivalentLabel}
            </Text>
          </View>
        </View>
        <View style={styles.pillColumn}>
          <ActionPill tone="income" />
          <ActionPill tone="expense" />
        </View>
      </View>
    </View>
  );
}

function WeeklyContent({ snapshot }: { snapshot: ReturnType<typeof buildSampleWidgetSnapshot> }) {
  const themeColors = useThemeColors();
  const data = snapshot.weeklyExpense;
  return (
    <View style={styles.pad}>
      <View style={styles.rowBetween}>
        <Banner />
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="label" tone="muted" style={styles.eyebrow}>
            Past 7 days
          </Text>
          <Text style={[styles.totalAmount, { color: themeColors.error }]} numberOfLines={1}>
            {data.totalLabel}
          </Text>
        </View>
      </View>
      <View style={styles.bars}>
        {data.days.map((day) => {
          const isZero = day.amount <= 0;
          const pct = isZero
            ? 0
            : Math.max(8, Math.round((day.amount / Math.max(1, data.maxAmount)) * 100));
          const isPeak = !isZero && day.amount >= data.maxAmount;
          const gradient = isPeak
            ? [themeColors.accent, themeColors.coral]
            : [themeColors.coral, themeColors.error];
          return (
            <View key={day.dayKey} style={styles.barCol}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.barValue,
                  {
                    color: isZero ? withColorAlpha(themeColors.textMuted, 0.5) : themeColors.error,
                  },
                ]}
                numberOfLines={1}
              >
                {isZero ? '–' : day.barLabel}
              </Text>
              <View style={styles.barTrack}>
                <LinearGradient
                  colors={gradient as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[styles.bar, { height: `${pct}%` }]}
                />
              </View>
              <Text
                allowFontScaling={false}
                style={[
                  styles.barDay,
                  { color: day.isToday ? themeColors.primary : themeColors.textMuted },
                ]}
              >
                {day.weekdayLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function IoChip({ tone, label }: { tone: 'income' | 'expense'; label: string }) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const accent = isIncome ? themeColors.success : themeColors.error;
  return (
    <View style={[styles.ioChip, { backgroundColor: withColorAlpha(accent, 0.12) }]}>
      {isIncome ? (
        <ArrowDownRight size={12} color={accent} strokeWidth={2.6} />
      ) : (
        <ArrowUpRight size={12} color={accent} strokeWidth={2.6} />
      )}
      <Text variant="caption" style={[styles.ioChipText, { color: accent }]}>
        {label}
      </Text>
    </View>
  );
}

type CalendarSlot =
  | { kind: 'spacer'; id: string }
  | {
      kind: 'day';
      day: ReturnType<typeof buildSampleWidgetSnapshot>['calendarMonth']['days'][number];
    };

function CalendarCell({ day }: { day: Extract<CalendarSlot, { kind: 'day' }>['day'] }) {
  const themeColors = useThemeColors();
  let bgColor: string;
  let borderColor: string;
  let dayColor: string;
  if (day.isToday) {
    bgColor = withColorAlpha(themeColors.primary, 0.16);
    borderColor = themeColors.primary;
    dayColor = themeColors.primary;
  } else if (day.hasActivity) {
    const accent = day.incomeStronger ? themeColors.success : themeColors.error;
    bgColor = withColorAlpha(accent, 0.08 + day.intensity * 0.2);
    borderColor = withColorAlpha(accent, 0.22 + day.intensity * 0.28);
    dayColor = accent;
  } else {
    bgColor = withColorAlpha(themeColors.surfaceMuted, 0.55);
    borderColor = withColorAlpha(themeColors.textMuted, 0.14);
    dayColor = themeColors.textMuted;
  }
  return (
    <View
      style={[
        styles.cell,
        { backgroundColor: bgColor, borderColor, borderWidth: day.isToday ? 1.5 : 1 },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.cellDay, { color: dayColor }]}>
        {day.dayNumber}
      </Text>
      <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
        {day.hasActivity ? (
          <>
            {day.incomeLabel ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.cellValue, { color: themeColors.success }]}
              >
                {day.incomeLabel}
              </Text>
            ) : null}
            {day.expenseLabel ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.cellValue, { color: themeColors.error }]}
              >
                {day.expenseLabel}
              </Text>
            ) : null}
          </>
        ) : (
          <Text
            allowFontScaling={false}
            style={[styles.cellValue, { color: withColorAlpha(themeColors.textMuted, 0.45) }]}
          >
            –
          </Text>
        )}
      </View>
    </View>
  );
}

function CalendarContent({ snapshot }: { snapshot: ReturnType<typeof buildSampleWidgetSnapshot> }) {
  const themeColors = useThemeColors();
  const data = snapshot.calendarMonth;

  // Lay out fixed week rows of 7 flex cells so the columns always line up and
  // the 7th column never wraps to a new row (the bug with fixed cell widths).
  const slots: CalendarSlot[] = [];
  for (let i = 0; i < data.leadingSpacers; i += 1) slots.push({ kind: 'spacer', id: `pre-${i}` });
  data.days.forEach((day) => slots.push({ kind: 'day', day }));
  while (slots.length % 7 !== 0) slots.push({ kind: 'spacer', id: `post-${slots.length}` });
  const weeks: CalendarSlot[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  return (
    <View style={styles.pad}>
      <View style={styles.calHeader}>
        <Banner width={104} />
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text variant="bodyStrong" style={{ fontSize: 14, color: themeColors.text }}>
            {data.monthLabel}
          </Text>
          <View style={styles.ioRow}>
            <IoChip tone="income" label={data.incomeLabel} />
            <IoChip tone="expense" label={data.expenseLabel} />
          </View>
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {data.weekdayLabels.map((label, index) => (
          <View key={`wd-${index}`} style={styles.cellFlex}>
            <Text variant="label" tone="muted" style={{ fontSize: 10, textAlign: 'center' }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, ri) => (
          <View key={`week-${ri}`} style={styles.weekRow}>
            {week.map((slot) =>
              slot.kind === 'spacer' ? (
                <View key={slot.id} style={styles.cellFlex} />
              ) : (
                <View key={slot.day.dayKey} style={styles.cellFlex}>
                  <CalendarCell day={slot.day} />
                </View>
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

export function WidgetShowcase({
  kind,
  width,
  maxHeight,
}: {
  kind: WidgetShowcaseKind;
  width: number;
  maxHeight?: number;
}) {
  const themeColors = useThemeColors();
  const { settings } = useApp();
  const snapshot = useMemo(() => buildSampleWidgetSnapshot(settings), [settings]);
  const isPro = kind !== 'monthly';

  let frameWidth = width;
  let frameHeight = frameWidth / RATIO[kind];
  if (maxHeight && frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = Math.round(frameHeight * RATIO[kind]);
  }

  return (
    <View
      style={[
        styles.frame,
        {
          width: frameWidth,
          height: frameHeight,
          backgroundColor: themeColors.background,
          borderColor: withColorAlpha(themeColors.text, 0.06),
        },
      ]}
    >
      {kind === 'monthly' ? (
        <MonthlyContent snapshot={snapshot} />
      ) : kind === 'weekly' ? (
        <WeeklyContent snapshot={snapshot} />
      ) : (
        <CalendarContent snapshot={snapshot} />
      )}
      {isPro ? <ProRibbon /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
    shadowColor: '#141E1A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
  },
  flexMin: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  ribbon: {
    position: 'absolute',
    top: 16,
    right: -24,
    width: 92,
    alignItems: 'center',
    paddingVertical: 3,
    transform: [{ rotate: '45deg' }],
  },
  ribbonText: {
    fontSize: 10,
    lineHeight: 13,
    color: '#fff',
    fontFamily: FONT.bold,
    letterSpacing: 1,
  },
  // monthly
  monthlyBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  bigAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  pillColumn: {
    width: 118,
    gap: 9,
  },
  pill: {
    height: 42,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
  },
  pillBadge: {
    width: 25,
    height: 25,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 13,
  },
  // weekly
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  totalAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    marginTop: 3,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    paddingTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 5,
  },
  barValue: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
  },
  barTrack: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    minHeight: 5,
  },
  barDay: {
    fontSize: 10.5,
    fontFamily: FONT.bold,
  },
  // calendar
  calHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  ioRow: {
    flexDirection: 'row',
    gap: 7,
  },
  ioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  ioChipText: {
    fontSize: 12,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginTop: 12,
    marginBottom: 6,
  },
  grid: {
    flex: 1,
    gap: GRID_GAP,
  },
  weekRow: {
    flex: 1,
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  cellFlex: {
    flex: 1,
  },
  cell: {
    flex: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 3,
    paddingBottom: 3,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  cellDay: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: FONT.bold,
  },
  cellValue: {
    fontSize: 8,
    lineHeight: 10,
    fontFamily: FONT.bold,
    textAlign: 'center',
  },
});
