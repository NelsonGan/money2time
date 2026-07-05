import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownRight, ArrowUpRight, Clock, Minus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { SavingsRateWidgetContent } from '~/components/widget-preview/SavingsRateWidgetContent';
import { WIDGET_DEFINITIONS, WIDGET_IDS, type WidgetSize } from '~/services/widgetRegistry';
import {
  buildMoney2TimeWidgetSnapshot,
  buildSampleWidgetSnapshot,
  parseSavingsExclusions,
  type CalendarMonthSnapshot,
  type MonthlyExpenseQuickLogSnapshot,
  type QuickAddSmallSnapshot,
  type SavingsHistorySnapshot,
  type SavingsRateSnapshot,
  type WeeklyExpenseSnapshot,
} from '~/services/widgetSnapshot.shared';
import { FONT } from '~/utils/fonts';

interface WidgetPreviewsScreenProps {
  onBack: () => void;
}

const BANNER_SOURCE = require('../../../assets/banner.png');

const SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'Small',
  medium: 'Medium · 4×2',
  large: 'Large · 4×4',
};

// Real WidgetKit aspect ratios so previews reflect on-device proportions.
const SIZE_RATIOS: Record<WidgetSize, number> = {
  small: 1,
  medium: 338 / 158,
  large: 338 / 354,
};

const WIDGET_RADIUS = 26;
const WIDGET_PADDING = 16;
const GRID_GAP = 4;

function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function PreviewBadge({ label }: { label: string }) {
  const themeColors = useThemeColors();
  return (
    <View style={[styles.badge, { backgroundColor: themeColors.surfaceMuted }]}>
      <Text variant="caption" tone="muted" style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}

// Diagonal "PRO" corner ribbon, clipped by the widget frame's rounded corner.
function ProRibbon() {
  const themeColors = useThemeColors();
  return (
    <View style={[styles.proRibbon, { backgroundColor: themeColors.accent }]} pointerEvents="none">
      <Text allowFontScaling={false} style={styles.proRibbonText}>
        PRO
      </Text>
    </View>
  );
}

function WidgetFrame({
  size,
  pro = false,
  children,
}: {
  size: WidgetSize;
  pro?: boolean;
  children: (dimensions: { width: number; height: number }) => React.ReactNode;
}) {
  const themeColors = useThemeColors();
  const { width } = useWindowDimensions();
  const availableWidth = width - SETTINGS_HORIZONTAL_PADDING * 2;
  // A small widget is a 158pt square on-device; medium/large span the 338pt grid width.
  const targetWidth = size === 'small' ? 158 : 338;
  const previewWidth = Math.min(targetWidth, availableWidth);
  const previewHeight = previewWidth / SIZE_RATIOS[size];

  return (
    <View style={styles.previewBlock}>
      <PreviewBadge label={SIZE_LABELS[size]} />
      <View
        style={[
          styles.widgetFrame,
          {
            width: previewWidth,
            height: previewHeight,
            backgroundColor: themeColors.background,
            borderColor: withColorAlpha(themeColors.text, 0.06),
          },
        ]}
      >
        {children({ width: previewWidth, height: previewHeight })}
        {pro ? <ProRibbon /> : null}
      </View>
    </View>
  );
}

function WordmarkBanner({ width = 116 }: { width?: number }) {
  return (
    <Image
      source={BANNER_SOURCE}
      contentFit="contain"
      contentPosition="left center"
      style={{ width, height: width * 0.27 }}
    />
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
      <View
        style={[styles.pillBlob, { backgroundColor: accent, opacity: 0.08 }]}
        pointerEvents="none"
      />
      <View style={[styles.pillBadge, { backgroundColor: accent }]}>
        {isIncome ? (
          <Plus size={15} color="#fff" strokeWidth={3.2} />
        ) : (
          <Minus size={15} color="#fff" strokeWidth={3.2} />
        )}
      </View>
      <Text variant="caption" style={[styles.pillLabel, { color: accent }]}>
        {isIncome ? 'Income' : 'Expense'}
      </Text>
    </View>
  );
}

function MonthlySpendWidgetPreview({ data }: { data: MonthlyExpenseQuickLogSnapshot }) {
  const themeColors = useThemeColors();

  return (
    <WidgetFrame size="medium">
      {() => (
        <View style={styles.pad}>
          <WordmarkBanner />
          <View style={styles.monthlyBody}>
            <View style={styles.monthlyColumn}>
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
                <Clock size={13} color={themeColors.primary} strokeWidth={2.4} />
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
      )}
    </WidgetFrame>
  );
}

function SmallActionButton({ tone }: { tone: 'income' | 'expense' }) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const accent = isIncome ? themeColors.success : themeColors.error;
  return (
    <View
      style={[
        styles.smallButton,
        {
          backgroundColor: withColorAlpha(accent, 0.12),
          borderColor: withColorAlpha(accent, 0.26),
        },
      ]}
    >
      {isIncome ? (
        <Plus size={20} color={accent} strokeWidth={3.2} />
      ) : (
        <Minus size={20} color={accent} strokeWidth={3.2} />
      )}
    </View>
  );
}

function QuickAddSmallWidgetPreview({ data }: { data: QuickAddSmallSnapshot }) {
  const themeColors = useThemeColors();

  return (
    <WidgetFrame size="small">
      {() => (
        <View style={styles.pad}>
          <View style={styles.smallTop}>
            <Text variant="label" tone="muted" style={styles.eyebrow}>
              This month
            </Text>
            <Text
              style={[styles.smallAmount, { color: themeColors.error }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {data.expenseLabel}
            </Text>
            <View style={styles.timeRow}>
              <Clock size={11} color={themeColors.primary} strokeWidth={2.4} />
              <Text variant="caption" style={{ color: themeColors.textSoft }} numberOfLines={1}>
                {data.timeEquivalentLabel}
              </Text>
            </View>
          </View>
          <View style={styles.smallButtonRow}>
            <SmallActionButton tone="income" />
            <SmallActionButton tone="expense" />
          </View>
        </View>
      )}
    </WidgetFrame>
  );
}

function SavingsHistoryRow({ month }: { month: SavingsHistorySnapshot['months'][number] }) {
  const themeColors = useThemeColors();
  const accent = !month.hasIncome
    ? themeColors.textMuted
    : month.isPositive
      ? themeColors.success
      : themeColors.error;
  // Positive rate fills proportionally; overspend shows a small coral bar.
  const fillPct = !month.hasIncome
    ? 0
    : month.isPositive
      ? Math.max(4, Math.min(1, month.savingsRate) * 100)
      : Math.max(8, Math.min(1, Math.abs(month.savingsRate)) * 100);

  return (
    <View style={styles.histRow}>
      <Text variant="caption" style={[styles.histMonth, { color: themeColors.textSoft }]}>
        {month.monthLabel}
      </Text>
      <View style={[styles.histTrack, { backgroundColor: withColorAlpha(themeColors.text, 0.06) }]}>
        <View
          style={[
            styles.histFill,
            {
              width: `${fillPct}%`,
              backgroundColor: month.hasActivity ? accent : withColorAlpha(themeColors.text, 0.08),
            },
          ]}
        />
      </View>
      <View style={styles.histValues}>
        <Text
          allowFontScaling={false}
          style={[styles.histRate, { color: month.hasActivity ? accent : themeColors.textMuted }]}
          numberOfLines={1}
        >
          {month.rateLabel}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.histSaved, { color: themeColors.textMuted }]}
          numberOfLines={1}
        >
          {month.savedLabel}
        </Text>
      </View>
    </View>
  );
}

function SavingsHistoryWidgetPreview({ data }: { data: SavingsHistorySnapshot }) {
  const themeColors = useThemeColors();
  const totalColor = data.totalIsPositive ? themeColors.success : themeColors.error;

  return (
    <WidgetFrame size="large" pro>
      {() => (
        <View style={styles.pad}>
          <View style={styles.headerRow}>
            <WordmarkBanner />
            <View style={styles.headerRight}>
              <Text style={[styles.totalAmount, { color: totalColor }]} numberOfLines={1}>
                {data.totalSavedLabel}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {data.averageRateLabel}
              </Text>
            </View>
          </View>
          <View style={styles.histRows}>
            {data.months.map((month) => (
              <SavingsHistoryRow key={month.monthKey} month={month} />
            ))}
          </View>
        </View>
      )}
    </WidgetFrame>
  );
}

function WeeklyExpenseWidgetPreview({ data }: { data: WeeklyExpenseSnapshot }) {
  const themeColors = useThemeColors();

  return (
    <WidgetFrame size="medium" pro>
      {() => (
        <View style={styles.pad}>
          <View style={styles.headerRow}>
            <WordmarkBanner />
            <View style={styles.headerRight}>
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
                        color: isZero
                          ? withColorAlpha(themeColors.textMuted, 0.5)
                          : themeColors.error,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {isZero ? '–' : day.barLabel}
                  </Text>
                  <View style={styles.barTrack}>
                    {isZero ? (
                      <View
                        style={[styles.barZero, { backgroundColor: themeColors.surfaceMuted }]}
                      />
                    ) : (
                      <LinearGradient
                        colors={gradient as [string, string]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={[styles.bar, { height: `${pct}%` }]}
                      />
                    )}
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
      )}
    </WidgetFrame>
  );
}

function SavingsRateWidgetPreview({ data }: { data: SavingsRateSnapshot }) {
  return (
    <WidgetFrame size="medium" pro>
      {() => <SavingsRateWidgetContent data={data} gradientId="savingsRateGradient" />}
    </WidgetFrame>
  );
}

function IoChip({ tone, label }: { tone: 'income' | 'expense'; label: string }) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const accent = isIncome ? themeColors.success : themeColors.error;
  return (
    <View style={[styles.ioChip, { backgroundColor: withColorAlpha(accent, 0.12) }]}>
      {isIncome ? (
        <ArrowDownRight size={13} color={accent} strokeWidth={2.6} />
      ) : (
        <ArrowUpRight size={13} color={accent} strokeWidth={2.6} />
      )}
      <Text variant="caption" style={[styles.ioChipText, { color: accent }]}>
        {label}
      </Text>
    </View>
  );
}

function CalendarWidgetPreview({ data }: { data: CalendarMonthSnapshot }) {
  const themeColors = useThemeColors();
  const { width } = useWindowDimensions();
  const availableWidth = width - SETTINGS_HORIZONTAL_PADDING * 2;
  const previewWidth = Math.min(338, availableWidth);
  const previewHeight = previewWidth / SIZE_RATIOS.large;

  const contentWidth = previewWidth - WIDGET_PADDING * 2;
  const cellWidth = Math.floor((contentWidth - GRID_GAP * 6) / 7);
  const totalSlots = data.leadingSpacers + data.days.length;
  const rows = Math.ceil(totalSlots / 7);
  // Frame height minus header, weekday strip and paddings, divided across rows.
  const gridHeight = previewHeight - WIDGET_PADDING * 2 - 56 - 22;
  const cellHeight = Math.max(28, Math.floor((gridHeight - (rows - 1) * GRID_GAP) / rows));

  const slots: (
    | { kind: 'spacer'; id: string }
    | { kind: 'day'; day: (typeof data.days)[number] }
  )[] = [];
  for (let i = 0; i < data.leadingSpacers; i += 1) slots.push({ kind: 'spacer', id: `pre-${i}` });
  data.days.forEach((day) => slots.push({ kind: 'day', day }));

  return (
    <WidgetFrame size="large" pro>
      {() => (
        <View style={styles.pad}>
          <View style={styles.calHeader}>
            <WordmarkBanner width={108} />
            <View style={styles.calHeaderRight}>
              <Text variant="bodyStrong" style={[styles.monthLabel, { color: themeColors.text }]}>
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
              <View key={`wd-${index}`} style={{ width: cellWidth, alignItems: 'center' }}>
                <Text variant="label" tone="muted" style={styles.weekdayText}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {slots.map((slot) => {
              if (slot.kind === 'spacer') {
                return <View key={slot.id} style={{ width: cellWidth, height: cellHeight }} />;
              }
              const { day } = slot;
              let bgColor: string;
              let borderColor: string;
              let dayNumberColor: string;

              if (day.isToday) {
                bgColor = withColorAlpha(themeColors.primary, 0.16);
                borderColor = themeColors.primary;
                dayNumberColor = themeColors.primary;
              } else if (day.hasActivity) {
                const accent = day.incomeStronger ? themeColors.success : themeColors.error;
                bgColor = withColorAlpha(accent, 0.08 + day.intensity * 0.2);
                borderColor = withColorAlpha(accent, 0.22 + day.intensity * 0.28);
                dayNumberColor = accent;
              } else {
                bgColor = withColorAlpha(themeColors.surfaceMuted, 0.55);
                borderColor = withColorAlpha(themeColors.textMuted, 0.14);
                dayNumberColor = themeColors.textMuted;
              }

              return (
                <View
                  key={day.dayKey}
                  style={[
                    styles.cell,
                    {
                      width: cellWidth,
                      height: cellHeight,
                      backgroundColor: bgColor,
                      borderColor,
                      borderWidth: day.isToday ? 1.5 : 1,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.cellDay, { color: dayNumberColor }]}
                  >
                    {day.dayNumber}
                  </Text>
                  <View style={styles.cellValues}>
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
                        style={[
                          styles.cellValue,
                          { color: withColorAlpha(themeColors.textMuted, 0.45) },
                        ]}
                      >
                        –
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </WidgetFrame>
  );
}

function DataSourceToggle({
  value,
  onChange,
}: {
  value: 'sample' | 'real';
  onChange: (next: 'sample' | 'real') => void;
}) {
  const themeColors = useThemeColors();
  const options: { key: 'sample' | 'real'; label: string }[] = [
    { key: 'sample', label: 'Sample (gallery)' },
    { key: 'real', label: 'My data' },
  ];
  return (
    <View style={[styles.segment, { backgroundColor: themeColors.surfaceMuted }]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segmentItem, active && { backgroundColor: themeColors.background }]}
          >
            <Text
              variant="caption"
              style={{ color: active ? themeColors.text : themeColors.textMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WidgetPreviewsScreen({ onBack }: WidgetPreviewsScreenProps) {
  const { settings, categories, insightsPreferencesJson, getTrueHourlyRateForDate } = useApp();
  const { transactions } = useTransactions();
  const { isPro } = usePro();
  const bottomNavInset = useSettingsBottomNavInset();
  // Default to the sample snapshot — this is exactly what the OS widget gallery shows.
  const [dataSource, setDataSource] = useState<'sample' | 'real'>('sample');

  const snapshot = useMemo(() => {
    if (dataSource === 'sample') return buildSampleWidgetSnapshot(settings);
    const savingsExclusions = parseSavingsExclusions(insightsPreferencesJson);
    return buildMoney2TimeWidgetSnapshot({
      transactions,
      settings,
      isPro,
      getTrueHourlyRateForDate,
      categories,
      excludedSavingsIncomeCategoryIds: savingsExclusions.income,
      excludedSavingsExpenseCategoryIds: savingsExclusions.expense,
    });
  }, [
    categories,
    dataSource,
    getTrueHourlyRateForDate,
    insightsPreferencesJson,
    isPro,
    settings,
    transactions,
  ]);

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title="Widget previews" />
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.contentBody}>
          <View style={styles.toggleWrap}>
            <DataSourceToggle value={dataSource} onChange={setDataSource} />
          </View>
          {WIDGET_DEFINITIONS.map((widget) => (
            <SettingsSection
              key={widget.id}
              title={widget.title}
              subtitle={widget.access === 'free' ? 'Free widget' : 'Pro widget'}
              showAccent={false}
            >
              {widget.id === WIDGET_IDS.monthlyExpenseQuickLog ? (
                <MonthlySpendWidgetPreview data={snapshot.monthlyExpenseQuickLog} />
              ) : widget.id === WIDGET_IDS.quickAddSmall ? (
                <QuickAddSmallWidgetPreview data={snapshot.quickAddSmall} />
              ) : widget.id === WIDGET_IDS.weeklyExpense ? (
                <WeeklyExpenseWidgetPreview data={snapshot.weeklyExpense} />
              ) : widget.id === WIDGET_IDS.savingsRate ? (
                <SavingsRateWidgetPreview data={snapshot.savingsRate} />
              ) : widget.id === WIDGET_IDS.savingsHistory ? (
                <SavingsHistoryWidgetPreview data={snapshot.savingsHistory} />
              ) : (
                <CalendarWidgetPreview data={snapshot.calendarMonth} />
              )}
            </SettingsSection>
          ))}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: spacing.lg,
  },
  toggleWrap: {
    paddingBottom: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  previewBlock: {
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  proRibbon: {
    position: 'absolute',
    top: 15,
    right: -24,
    width: 92,
    alignItems: 'center',
    paddingVertical: 3,
    transform: [{ rotate: '45deg' }],
  },
  proRibbonText: {
    fontSize: 10,
    lineHeight: 13,
    color: '#fff',
    fontFamily: FONT.bold,
    letterSpacing: 1,
  },
  widgetFrame: {
    borderRadius: WIDGET_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#141E1A',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  // ----- Monthly spend -----
  monthlyBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  monthlyColumn: {
    flex: 1,
    minWidth: 0,
  },
  bigAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 34,
    lineHeight: 38,
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
    width: 120,
    gap: 10,
  },
  pill: {
    height: 44,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  pillBlob: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  pillBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 13.5,
  },
  // ----- Quick Add (small) -----
  smallTop: {
    flex: 1,
    justifyContent: 'center',
  },
  smallAmount: {
    fontFamily: FONT.monoBold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  smallButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ----- Savings history (large) -----
  histRows: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  histMonth: {
    width: 34,
    fontFamily: FONT.bold,
  },
  histTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  histFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 4,
  },
  histValues: {
    width: 64,
    alignItems: 'flex-end',
  },
  histRate: {
    textAlign: 'right',
    fontFamily: FONT.monoBold,
    fontSize: 15,
    lineHeight: 18,
  },
  histSaved: {
    textAlign: 'right',
    fontFamily: FONT.bold,
    fontSize: 10,
    lineHeight: 12,
  },
  // ----- Weekly expense -----
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerRight: {
    alignItems: 'flex-end',
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
  barZero: {
    width: '100%',
    height: 5,
    borderRadius: 4,
  },
  barDay: {
    fontSize: 10.5,
    fontFamily: FONT.bold,
  },
  // ----- Calendar -----
  calHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calHeaderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  monthLabel: {
    fontSize: 14,
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
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  weekdayText: {
    fontSize: 10,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cell: {
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
  cellValues: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  cellValue: {
    fontSize: 8,
    lineHeight: 10,
    fontFamily: FONT.bold,
    textAlign: 'center',
  },
});
