import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Info,
  Lock,
  Minus,
  Plus,
  Smartphone,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { SavingsRateWidgetContent } from '~/components/widget-preview/SavingsRateWidgetContent';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { WIDGET_DEFINITIONS, WIDGET_IDS, type WidgetSize } from '~/services/widgetRegistry';
import {
  buildMoney2TimeWidgetSnapshot,
  buildSampleWidgetSnapshot,
  parseSavingsExclusions,
  parseWidgetPrefs,
  serializeWidgetPrefs,
  type CalendarMonthSnapshot,
  type MonthlyExpenseQuickLogSnapshot,
  type QuickAddSmallSnapshot,
  type SavingsHistorySnapshot,
  type SavingsRateSnapshot,
  type WeeklyExpenseSnapshot,
  type WidgetPrefs,
} from '~/services/widgetSnapshot.shared';
import { FONT } from '~/utils/fonts';

interface WidgetSettingsScreenProps {
  onBack: () => void;
  onOpenProPaywall: () => void;
}

const BANNER_SOURCE = require('../../../assets/banner.png');

const SIZE_RATIOS: Record<WidgetSize, number> = {
  small: 1,
  medium: 338 / 158,
  large: 338 / 354,
};

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: 'widgets.badge_small',
  medium: 'widgets.badge_medium',
  large: 'widgets.badge_large',
};

const WIDGET_RADIUS = 26;
const WIDGET_PADDING = 16;
const GRID_GAP = 4;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
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

function WidgetFrame({
  size,
  children,
}: {
  size: WidgetSize;
  children: (dimensions: { width: number; height: number }) => React.ReactNode;
}) {
  const themeColors = useThemeColors();
  const { width } = useWindowDimensions();
  const availableWidth = width - SETTINGS_HORIZONTAL_PADDING * 2 - 32;
  const targetWidth = size === 'small' ? 158 : 338;
  const previewWidth = Math.min(targetWidth, availableWidth);
  const previewHeight = previewWidth / SIZE_RATIOS[size];

  return (
    <View
      style={[
        styles.widgetFrame,
        {
          width: previewWidth,
          height: previewHeight,
          backgroundColor: themeColors.background,
          borderColor: withAlpha(themeColors.text, 0.06),
        },
      ]}
    >
      {children({ width: previewWidth, height: previewHeight })}
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
          backgroundColor: withAlpha(accent, 0.11),
          borderColor: withAlpha(accent, 0.26),
        },
      ]}
    >
      <View style={[styles.pillBlob, { backgroundColor: accent, opacity: 0.08 }]} />
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

function MonthlySpendPreview({ data }: { data: MonthlyExpenseQuickLogSnapshot }) {
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
              {data.timeEquivalentLabel ? (
                <View style={styles.timeRow}>
                  <Clock size={13} color={themeColors.primary} strokeWidth={2.4} />
                  <Text variant="caption" style={{ color: themeColors.textSoft }} numberOfLines={1}>
                    {data.timeEquivalentLabel}
                  </Text>
                </View>
              ) : null}
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
          backgroundColor: withAlpha(accent, 0.12),
          borderColor: withAlpha(accent, 0.26),
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

function QuickAddPreview({ data }: { data: QuickAddSmallSnapshot }) {
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
            {data.timeEquivalentLabel ? (
              <View style={styles.timeRow}>
                <Clock size={11} color={themeColors.primary} strokeWidth={2.4} />
                <Text variant="caption" style={{ color: themeColors.textSoft }} numberOfLines={1}>
                  {data.timeEquivalentLabel}
                </Text>
              </View>
            ) : null}
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

function WeeklyExpensePreview({ data }: { data: WeeklyExpenseSnapshot }) {
  const themeColors = useThemeColors();
  return (
    <WidgetFrame size="medium">
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
                        color: isZero ? withAlpha(themeColors.textMuted, 0.5) : themeColors.error,
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

function SavingsRatePreview({ data }: { data: SavingsRateSnapshot }) {
  return (
    <WidgetFrame size="medium">
      {() => <SavingsRateWidgetContent data={data} gradientId="savingsRateGradientSettings" />}
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
      <View style={[styles.histTrack, { backgroundColor: withAlpha(themeColors.text, 0.06) }]}>
        <View
          style={[
            styles.histFill,
            {
              width: `${fillPct}%`,
              backgroundColor: month.hasActivity ? accent : withAlpha(themeColors.text, 0.08),
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

function SavingsHistoryPreview({ data }: { data: SavingsHistorySnapshot }) {
  const themeColors = useThemeColors();
  const totalColor = data.totalIsPositive ? themeColors.success : themeColors.error;
  return (
    <WidgetFrame size="large">
      {() => (
        <View style={styles.pad}>
          <View style={styles.headerRow}>
            <WordmarkBanner />
            <View style={styles.headerRight}>
              <Text variant="label" tone="muted" style={styles.eyebrow}>
                Saved · 6 mo
              </Text>
              <Text style={[styles.totalAmount, { color: totalColor }]} numberOfLines={1}>
                {data.totalSavedLabel}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                Avg rate {data.averageRateLabel}
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

function IoChip({ tone, label }: { tone: 'income' | 'expense'; label: string }) {
  const themeColors = useThemeColors();
  const isIncome = tone === 'income';
  const accent = isIncome ? themeColors.success : themeColors.error;
  return (
    <View style={[styles.ioChip, { backgroundColor: withAlpha(accent, 0.12) }]}>
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

function CalendarPreview({ data }: { data: CalendarMonthSnapshot }) {
  const themeColors = useThemeColors();
  const { width } = useWindowDimensions();
  const availableWidth = width - SETTINGS_HORIZONTAL_PADDING * 2 - 32;
  const previewWidth = Math.min(338, availableWidth);
  const previewHeight = previewWidth / SIZE_RATIOS.large;

  const contentWidth = previewWidth - WIDGET_PADDING * 2;
  const cellWidth = Math.floor((contentWidth - GRID_GAP * 6) / 7);
  const totalSlots = data.leadingSpacers + data.days.length;
  const rows = Math.ceil(totalSlots / 7);
  const gridHeight = previewHeight - WIDGET_PADDING * 2 - 56 - 22;
  const cellHeight = Math.max(28, Math.floor((gridHeight - (rows - 1) * GRID_GAP) / rows));

  const slots: (
    | { kind: 'spacer'; id: string }
    | { kind: 'day'; day: (typeof data.days)[number] }
  )[] = [];
  for (let i = 0; i < data.leadingSpacers; i += 1) slots.push({ kind: 'spacer', id: `pre-${i}` });
  data.days.forEach((day) => slots.push({ kind: 'day', day }));

  return (
    <WidgetFrame size="large">
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
                bgColor = withAlpha(themeColors.primary, 0.16);
                borderColor = themeColors.primary;
                dayNumberColor = themeColors.primary;
              } else if (day.hasActivity) {
                const accent = day.incomeStronger ? themeColors.success : themeColors.error;
                bgColor = withAlpha(accent, 0.08 + day.intensity * 0.2);
                borderColor = withAlpha(accent, 0.22 + day.intensity * 0.28);
                dayNumberColor = accent;
              } else {
                bgColor = withAlpha(themeColors.surfaceMuted, 0.55);
                borderColor = withAlpha(themeColors.textMuted, 0.14);
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
                          { color: withAlpha(themeColors.textMuted, 0.45) },
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

// ----- Per-widget card components -----

function SizeBadge({ size }: { size: WidgetSize }) {
  const themeColors = useThemeColors();
  return (
    <View style={[styles.sizeBadge, { backgroundColor: withAlpha(themeColors.textMuted, 0.1) }]}>
      <Text allowFontScaling={false} style={[styles.badgeText, { color: themeColors.textMuted }]}>
        {I18n.t(SIZE_LABEL[size])}
      </Text>
    </View>
  );
}

function AccessBadge({ access }: { access: 'free' | 'pro' }) {
  const themeColors = useThemeColors();
  const isPro = access === 'pro';
  return (
    <View
      style={[
        styles.accessBadge,
        {
          backgroundColor: isPro
            ? withAlpha(themeColors.primary, 0.12)
            : withAlpha(themeColors.success, 0.12),
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.badgeText,
          { color: isPro ? themeColors.primary : themeColors.success, fontFamily: FONT.bold },
        ]}
      >
        {isPro ? I18n.t('widgets.badge_pro') : I18n.t('widgets.badge_free')}
      </Text>
    </View>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
  locked,
  onLockedPress,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  locked?: boolean;
  onLockedPress?: () => void;
}) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      onPress={
        locked
          ? () => {
              void triggerHaptic('selection');
              onLockedPress?.();
            }
          : undefined
      }
      style={[
        styles.toggleRow,
        { borderColor: withAlpha(themeColors.text, 0.06) },
        locked ? { opacity: 0.55 } : undefined,
      ]}
    >
      <View style={styles.toggleRowText}>
        <Text variant="bodyStrong" className="text-sm">
          {label}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {locked ? (
        <View style={[styles.lockBadge, { backgroundColor: withAlpha(themeColors.primary, 0.12) }]}>
          <Lock size={11} color={themeColors.primary} strokeWidth={2.5} />
          <Text
            allowFontScaling={false}
            style={[styles.lockBadgeText, { color: themeColors.primary }]}
          >
            Pro
          </Text>
        </View>
      ) : (
        <Switch
          value={value}
          onValueChange={(v) => {
            void triggerHaptic('selection');
            onToggle(v);
          }}
          trackColor={{ true: themeColors.primary, false: withAlpha(themeColors.textMuted, 0.25) }}
          thumbColor={Platform.OS === 'android' ? (value ? themeColors.primary : '#fff') : '#fff'}
        />
      )}
    </Pressable>
  );
}

function InfoRow({ label, subtitle }: { label: string; subtitle?: string }) {
  const themeColors = useThemeColors();
  return (
    <View style={[styles.infoRow, { borderColor: withAlpha(themeColors.text, 0.06) }]}>
      <View style={[styles.infoIcon, { backgroundColor: withAlpha(themeColors.primary, 0.1) }]}>
        <Info size={14} color={themeColors.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.toggleRowText}>
        <Text variant="bodyStrong" className="text-sm">
          {label}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ProLockedOverlay({ onPress }: { onPress: () => void }) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      style={[styles.proOverlay, { backgroundColor: withAlpha(themeColors.background, 0.88) }]}
    >
      <View
        style={[styles.proOverlayInner, { backgroundColor: withAlpha(themeColors.primary, 0.1) }]}
      >
        <Lock size={18} color={themeColors.primary} strokeWidth={2.2} />
        <View style={styles.proOverlayText}>
          <Text variant="bodyStrong" style={{ color: themeColors.primary }}>
            {I18n.t('widgets.pro_required_title')}
          </Text>
          <Text variant="caption" tone="muted">
            {I18n.t('widgets.pro_required_body')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

interface WidgetCardProps {
  widgetId: string;
  title: string;
  access: 'free' | 'pro';
  size: WidgetSize;
  isPro: boolean;
  preview: React.ReactNode;
  customization?: React.ReactNode;
  onOpenPaywall: () => void;
}

function WidgetCard({
  title,
  access,
  size,
  isPro,
  preview,
  customization,
  onOpenPaywall,
}: WidgetCardProps) {
  const themeColors = useThemeColors();
  const isLocked = access === 'pro' && !isPro;

  return (
    <View
      style={[
        styles.widgetCard,
        {
          backgroundColor: themeColors.card,
          borderColor: withAlpha(themeColors.text, 0.07),
        },
        Platform.OS === 'ios'
          ? {
              shadowColor: '#0F172A',
              shadowOpacity: 0.06,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 4 },
            }
          : { elevation: 2 },
      ]}
    >
      {/* Preview area */}
      <View
        style={[styles.previewArea, { backgroundColor: withAlpha(themeColors.surfaceMuted, 0.5) }]}
      >
        <View style={styles.previewCenter}>{preview}</View>
        {isLocked ? <ProLockedOverlay onPress={onOpenPaywall} /> : null}
      </View>

      {/* Meta row */}
      <View style={[styles.metaRow, { borderTopColor: withAlpha(themeColors.text, 0.05) }]}>
        <Text variant="subheading" className="text-sm flex-1" numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.badgeRow}>
          <SizeBadge size={size} />
          <AccessBadge access={access} />
        </View>
      </View>

      {/* Customization section */}
      {customization ? (
        <View
          style={[
            styles.customizationSection,
            { borderTopColor: withAlpha(themeColors.text, 0.05) },
          ]}
        >
          <Text
            variant="label"
            style={[styles.customizationHeader, { color: withAlpha(themeColors.textMuted, 0.7) }]}
          >
            {I18n.t('widgets.customization_section').toUpperCase()}
          </Text>
          {customization}
        </View>
      ) : null}
    </View>
  );
}

function DataSourceToggle({
  value,
  onChange,
}: {
  value: 'sample' | 'real';
  onChange: (v: 'sample' | 'real') => void;
}) {
  const themeColors = useThemeColors();
  const options: { key: 'sample' | 'real'; label: string }[] = [
    { key: 'sample', label: I18n.t('widgets.sample_data') },
    { key: 'real', label: I18n.t('widgets.my_data') },
  ];
  return (
    <View style={[styles.segment, { backgroundColor: themeColors.surfaceMuted }]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              void triggerHaptic('selection');
              onChange(option.key);
            }}
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

function HowToAddBanner() {
  const themeColors = useThemeColors();
  return (
    <View
      style={[
        styles.howToAdd,
        {
          backgroundColor: withAlpha(themeColors.primary, 0.07),
          borderColor: withAlpha(themeColors.primary, 0.15),
        },
      ]}
    >
      <View
        style={[styles.howToAddIcon, { backgroundColor: withAlpha(themeColors.primary, 0.12) }]}
      >
        <Smartphone size={20} color={themeColors.primary} strokeWidth={2} />
      </View>
      <View style={styles.howToAddText}>
        <Text variant="bodyStrong" style={[styles.howToAddTitle, { color: themeColors.primary }]}>
          {I18n.t('widgets.how_to_add_title')}
        </Text>
        <Text variant="caption" tone="muted" style={styles.howToAddBody}>
          {I18n.t('widgets.how_to_add_body')}
        </Text>
      </View>
    </View>
  );
}

export function WidgetSettingsScreen({ onBack, onOpenProPaywall }: WidgetSettingsScreenProps) {
  const {
    settings,
    transactions,
    categories,
    insightsPreferencesJson,
    updateInsightsPreferencesJson,
    getTrueHourlyRateForDate,
  } = useApp();
  const { isPro } = usePro();
  const [dataSource, setDataSource] = useState<'sample' | 'real'>('sample');

  const widgetPrefs = useMemo(
    () => parseWidgetPrefs(insightsPreferencesJson),
    [insightsPreferencesJson],
  );

  const updateWidgetPrefs = useCallback(
    (patch: Partial<WidgetPrefs>) => {
      const next: WidgetPrefs = { ...widgetPrefs, ...patch };
      const newJson = serializeWidgetPrefs(insightsPreferencesJson, next);
      updateInsightsPreferencesJson(newJson);
    },
    [insightsPreferencesJson, updateInsightsPreferencesJson, widgetPrefs],
  );

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
      widgetPrefs,
    });
  }, [
    categories,
    dataSource,
    getTrueHourlyRateForDate,
    insightsPreferencesJson,
    isPro,
    settings,
    transactions,
    widgetPrefs,
  ]);

  const timeEquivalentCustomization = (
    <ToggleRow
      label={I18n.t('widgets.show_time_equivalent')}
      subtitle={I18n.t('widgets.show_time_equivalent_subtitle')}
      value={widgetPrefs.showTimeEquivalent}
      onToggle={(v) => updateWidgetPrefs({ showTimeEquivalent: v })}
      locked={!isPro}
      onLockedPress={onOpenProPaywall}
    />
  );

  const savingsCustomization = (
    <InfoRow
      label={I18n.t('widgets.savings_source_label')}
      subtitle={I18n.t('widgets.savings_source_subtitle')}
    />
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        onBack={onBack}
        title={I18n.t('widgets.page_title')}
        subtitle={I18n.t('widgets.page_subtitle')}
      />
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <View style={styles.body}>
          <DataSourceToggle value={dataSource} onChange={setDataSource} />

          <View style={styles.cardList}>
            {WIDGET_DEFINITIONS.map((widget) => {
              const size = widget.supportedSizes[0];
              let preview: React.ReactNode;
              let customization: React.ReactNode | undefined;

              if (widget.id === WIDGET_IDS.monthlyExpenseQuickLog) {
                preview = <MonthlySpendPreview data={snapshot.monthlyExpenseQuickLog} />;
                customization = timeEquivalentCustomization;
              } else if (widget.id === WIDGET_IDS.quickAddSmall) {
                preview = <QuickAddPreview data={snapshot.quickAddSmall} />;
                customization = timeEquivalentCustomization;
              } else if (widget.id === WIDGET_IDS.weeklyExpense) {
                preview = <WeeklyExpensePreview data={snapshot.weeklyExpense} />;
              } else if (widget.id === WIDGET_IDS.savingsRate) {
                preview = <SavingsRatePreview data={snapshot.savingsRate} />;
                customization = savingsCustomization;
              } else if (widget.id === WIDGET_IDS.savingsHistory) {
                preview = <SavingsHistoryPreview data={snapshot.savingsHistory} />;
                customization = savingsCustomization;
              } else {
                preview = <CalendarPreview data={snapshot.calendarMonth} />;
              }

              return (
                <WidgetCard
                  key={widget.id}
                  widgetId={widget.id}
                  title={widget.title}
                  access={widget.access}
                  size={size}
                  isPro={isPro}
                  preview={preview}
                  customization={customization}
                  onOpenPaywall={onOpenProPaywall}
                />
              );
            })}
          </View>

          <HowToAddBanner />
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  body: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  // Data source toggle
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
  // Widget cards
  cardList: {
    gap: spacing.lg,
  },
  widgetCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewArea: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  previewCenter: {
    alignItems: 'center',
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sizeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  accessBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customizationSection: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: 12,
    gap: 8,
  },
  customizationHeader: {
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  // Pro locked overlay
  proOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proOverlayInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    maxWidth: 280,
  },
  proOverlayText: {
    flex: 1,
    gap: 3,
  },
  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  toggleRowText: {
    flex: 1,
    minWidth: 0,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
  },
  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // How to add banner
  howToAdd: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  howToAddIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  howToAddText: {
    flex: 1,
    gap: 3,
  },
  howToAddTitle: {
    fontSize: 14,
  },
  howToAddBody: {
    lineHeight: 18,
  },
  // Widget preview sub-styles
  pad: {
    flex: 1,
    padding: WIDGET_PADDING,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
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
