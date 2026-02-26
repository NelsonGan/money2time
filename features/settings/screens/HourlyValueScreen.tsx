import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { SelectField } from '~/components/ui/select';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
} from '~/components/ui/settings';
import { useApp } from '~/context/AppContext';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import type { MonthlyWageSettings, WageConfig } from '~/types';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import { monthKeyFromDateLocal, normalizeMonthKey } from '~/utils/formatters';
import { I18n } from '~/lib/i18n';
import { useThemeColors } from '~/hooks/useThemeColors';

interface HourlyValueScreenProps {
  onClose: () => void;
  onOpenWageCalculator: (params: { monthKey: string; initialConfig: WageConfig }) => void;
}

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

type EffectiveRateMode = 'exact' | 'before-earliest' | 'between' | 'after-latest' | 'fallback';

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

function formatMonthLabel(monthKey: string) {
  const normalizedMonth = normalizeMonthKey(monthKey);
  const year = normalizedMonth.slice(0, 4);
  const month = normalizedMonth.slice(5, 7);
  const monthLabel = MONTH_OPTIONS.find((item) => item.value === month)?.label;
  if (!monthLabel) return normalizedMonth;
  return `${monthLabel} ${year}`;
}

function getEffectiveRateInfo(
  history: MonthlyWageSettings[],
  targetMonth: string,
  fallback: MonthlyWageSettings | null,
): {
  effectiveWage: MonthlyWageSettings | null;
  sourceMonth: string | null;
  hasExactMatch: boolean;
  mode: EffectiveRateMode;
} {
  const normalizedTarget = normalizeMonthKey(targetMonth);

  if (history.length === 0) {
    return {
      effectiveWage: fallback,
      sourceMonth: fallback?.month ?? null,
      hasExactMatch: false,
      mode: 'fallback',
    };
  }

  const ordered = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const exactMatch = ordered.find((item) => item.month === normalizedTarget) ?? null;
  const earliest = ordered[0];
  const latest = ordered[ordered.length - 1];

  let source = earliest ?? null;
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    if (!entry) continue;
    if (entry.month > normalizedTarget) break;
    source = entry;
  }

  if (exactMatch) {
    return {
      effectiveWage: exactMatch,
      sourceMonth: exactMatch.month,
      hasExactMatch: true,
      mode: 'exact',
    };
  }

  const mode: EffectiveRateMode =
    normalizedTarget < (earliest?.month ?? '')
      ? 'before-earliest'
      : normalizedTarget > (latest?.month ?? '')
        ? 'after-latest'
        : 'between';

  return {
    effectiveWage: source ?? fallback,
    sourceMonth: source?.month ?? fallback?.month ?? null,
    hasExactMatch: false,
    mode,
  };
}

export function HourlyValueScreen({ onClose, onOpenWageCalculator }: HourlyValueScreenProps) {
  const {
    settings,
    currentMonthWage,
    monthlyWages,
    deleteWageConfigForMonth,
  } = useApp();
  const themeColors = useThemeColors();
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    String(new Date().getMonth() + 1).padStart(2, '0'),
  );

  const currentMonth = useMemo(() => monthKeyFromDateLocal(new Date()), []);
  const selectedWageMonth = normalizeMonthKey(`${selectedYear}-${selectedMonth}`);
  const selectedMonthLabel = useMemo(
    () => formatMonthLabel(selectedWageMonth),
    [selectedWageMonth],
  );

  const normalizedHistory = useMemo(() => normalizeAndDedupeHistory(monthlyWages), [monthlyWages]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const fromRange = Array.from({ length: 9 }, (_, i) => String(currentYear - 5 + i));
    const fromData = Array.from(new Set(normalizedHistory.map((item) => item.month.slice(0, 4))));
    return Array.from(new Set([...fromRange, ...fromData, selectedYear])).sort(
      (a, b) => Number(b) - Number(a),
    );
  }, [normalizedHistory, selectedYear]);

  const historyAsc = useMemo(
    () => [...normalizedHistory].sort((a, b) => a.month.localeCompare(b.month)),
    [normalizedHistory],
  );
  const historyForDisplay = useMemo(
    () => [...normalizedHistory].sort((a, b) => b.month.localeCompare(a.month)),
    [normalizedHistory],
  );

  const effectiveRateInfo = useMemo(
    () => getEffectiveRateInfo(historyAsc, selectedWageMonth, currentMonthWage),
    [currentMonthWage, historyAsc, selectedWageMonth],
  );

  const targetWage = effectiveRateInfo.effectiveWage;
  const sourceMonth = effectiveRateInfo.sourceMonth;
  const sourceMonthLabel = useMemo(
    () => (sourceMonth ? formatMonthLabel(sourceMonth) : selectedMonthLabel),
    [selectedMonthLabel, sourceMonth],
  );

  const effectiveReason = useMemo(() => {
    switch (effectiveRateInfo.mode) {
      case 'exact':
        return I18n.t('settings.hourly_effective_reason_exact', { month: selectedMonthLabel });
      case 'before-earliest':
        return I18n.t('settings.hourly_effective_reason_before_earliest', {
          month: selectedMonthLabel,
          sourceMonth: sourceMonthLabel,
        });
      case 'after-latest':
        return I18n.t('settings.hourly_effective_reason_after_latest', {
          month: selectedMonthLabel,
          sourceMonth: sourceMonthLabel,
        });
      case 'between':
        return I18n.t('settings.hourly_effective_reason_between', {
          month: selectedMonthLabel,
          sourceMonth: sourceMonthLabel,
        });
      case 'fallback':
      default:
        return I18n.t('settings.hourly_effective_reason_fallback');
    }
  }, [effectiveRateInfo.mode, selectedMonthLabel, sourceMonthLabel]);

  const prefillConfig = targetWage
    ? {
        wageType: targetWage.wageType,
        wageAmount: targetWage.wageAmount,
        hoursWorkedPerWeek: targetWage.hoursWorkedPerWeek,
        workdaysPerWeek: targetWage.workdaysPerWeek,
        commuteMinutesPerWorkday: targetWage.commuteMinutesPerWorkday,
      }
    : DEFAULT_WAGE_CONFIG;

  const ctaLabel = effectiveRateInfo.hasExactMatch
    ? I18n.t('settings.hourly_cta_update', { month: selectedMonthLabel })
    : I18n.t('settings.hourly_cta_add', { month: selectedMonthLabel });

  const confirmDeleteMonth = (month: string) => {
    const normalizedMonth = normalizeMonthKey(month);
    if (normalizedMonth === currentMonth) return;

    void triggerHaptic('warning');
    Alert.alert(
      I18n.t('settings.hourly_delete_title'),
      I18n.t('settings.hourly_delete_message', { month: formatMonthLabel(normalizedMonth) }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void triggerHaptic('warning');
            deleteWageConfigForMonth(normalizedMonth);
          },
        },
      ],
    );
  };

  return (
    <SettingsPageLayout>
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={I18n.t('settings.hourly_value')}
          subtitle={I18n.t('settings.manage_formulas')}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
        }}
      >
        <Card>
          <CardContent className="py-5 gap-4">
            <Text variant="label" tone="muted">
              {I18n.t('settings.hourly_selected_month_title')}
            </Text>

            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <SelectField
                  label={I18n.t('settings.year')}
                  value={selectedYear}
                  onChange={setSelectedYear}
                  options={yearOptions.map((year) => ({ value: year, label: year }))}
                />
              </View>
              <View className="flex-1">
                <SelectField
                  label={I18n.t('settings.month')}
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={MONTH_OPTIONS}
                />
              </View>
            </View>

            <View className="rounded-[20px] border border-border/35 bg-secondary/35 px-4 py-3">
              <Text variant="label" tone="muted">
                {I18n.t('settings.hourly_selected_month')}
              </Text>
              <Text variant="subheading" className="mt-1">
                {selectedMonthLabel}
              </Text>
              {selectedWageMonth === currentMonth ? (
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('settings.hourly_selected_month_current_note')}
                </Text>
              ) : null}
            </View>

            <Button
              onPress={() => {
                void triggerHaptic('selection');
                onOpenWageCalculator({
                  monthKey: selectedWageMonth,
                  initialConfig: prefillConfig,
                });
              }}
            >
              <Text>{ctaLabel}</Text>
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="py-5 gap-3">
            <Text variant="label" tone="muted">
              {I18n.t('settings.hourly_effective_panel_title')}
            </Text>
            <Text variant="subheading" className="text-primary">
              {settings.currencySymbol}
              {(targetWage?.trueHourlyRate ?? 0).toFixed(2)}/hr
            </Text>
            <View className="rounded-[18px] border border-primary/20 bg-primary/8 px-4 py-3 gap-2">
              <EffectiveRateRow
                label={I18n.t('settings.hourly_effective_source_month')}
                value={sourceMonthLabel}
              />
              <Text variant="caption" tone="muted">
                {effectiveReason}
              </Text>
              <Text variant="label" tone="muted">
                {I18n.t('settings.hourly_rule_short')}
              </Text>
            </View>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="py-5 gap-2.5">
            <Text variant="label" tone="muted">
              {I18n.t('settings.history')}
            </Text>

            {historyForDisplay.length === 0 ? (
              <Text variant="friendly" tone="muted">
                {I18n.t('settings.hourly_history_empty')}
              </Text>
            ) : null}

            {historyForDisplay.map((item) => {
              const isSelectedMonth = item.month === selectedWageMonth;
              const isCurrentMonth = item.month === currentMonth;
              const isSourceMonth = item.month === sourceMonth;

              const cardClassName = cn(
                'rounded-[20px] border px-4 py-3 gap-3',
                isSelectedMonth
                  ? 'border-primary/40 bg-primary/10'
                  : isSourceMonth
                    ? 'border-accent/45 bg-accent/12'
                    : isCurrentMonth
                      ? 'border-success/35 bg-success/10'
                      : 'border-border/35 bg-secondary/35',
              );

              return (
                <View key={item.id} className={cardClassName}>
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setSelectedYear(item.month.slice(0, 4));
                      setSelectedMonth(item.month.slice(5, 7));
                    }}
                    className="flex-row items-start justify-between gap-3"
                  >
                    <View className="flex-1 gap-1.5">
                      <Text variant="caption">{formatMonthLabel(item.month)}</Text>
                      <View className="flex-row flex-wrap gap-1.5 pt-1">
                        {isSelectedMonth ? (
                          <HistoryBadge
                            label={I18n.t('settings.hourly_badge_selected')}
                            tone="primary"
                          />
                        ) : null}
                        {isCurrentMonth ? (
                          <HistoryBadge
                            label={I18n.t('settings.hourly_badge_current')}
                            tone="success"
                          />
                        ) : null}
                        {isSourceMonth ? (
                          <HistoryBadge
                            label={I18n.t('settings.hourly_badge_source')}
                            tone="accent"
                          />
                        ) : null}
                      </View>
                    </View>
                    <Text variant="subheading" className="text-primary">
                      {settings.currencySymbol}
                      {item.trueHourlyRate.toFixed(2)}/hr
                    </Text>
                  </Pressable>

                  {isCurrentMonth ? (
                    <Text variant="label" tone="muted">
                      {I18n.t('settings.hourly_current_month_locked')}
                    </Text>
                  ) : (
                    <View className="items-end">
                      <Pressable
                        onPress={() => confirmDeleteMonth(item.month)}
                        className="flex-row items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1.5"
                      >
                        <Trash2 size={13} color={themeColors.coral} />
                        <Text variant="label" tone="error">
                          {I18n.t('common.delete')}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </CardContent>
        </Card>
      </ScrollView>

    </SettingsPageLayout>
  );
}

function EffectiveRateRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="caption" className="text-foreground text-right flex-1">
        {value}
      </Text>
    </View>
  );
}

function HistoryBadge({ label, tone }: { label: string; tone: 'primary' | 'success' | 'accent' }) {
  const style =
    tone === 'primary'
      ? 'border-primary/30 bg-primary/15'
      : tone === 'success'
        ? 'border-success/30 bg-success/15'
        : 'border-accent/35 bg-accent/20';

  return (
    <View className={cn('rounded-full border px-2 py-1', style)}>
      <Text
        variant="label"
        className={cn(
          tone === 'primary'
            ? 'text-primary'
            : tone === 'success'
              ? 'text-success'
              : 'text-accent-foreground',
        )}
      >
        {label}
      </Text>
    </View>
  );
}
