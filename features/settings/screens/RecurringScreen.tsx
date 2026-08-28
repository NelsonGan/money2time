import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  AddIconButton,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  RecurringCommitmentCard,
  type RecurringCommitmentCardProps,
} from '~/features/settings/components/RecurringCommitmentCard';
import { RecurringSummary } from '~/features/settings/components/RecurringSummary';
import { TimelineDayHeader, TimelineRail } from '~/features/settings/components/RecurringTimeline';
import {
  RecurringWeekStrip,
  type WeekStripDay,
} from '~/features/settings/components/RecurringWeekStrip';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';
import type { RecurringTransactionRule } from '~/types';
import { convert } from '~/utils/currency';
import { financialMonthKeyForDate, financialMonthRange } from '~/utils/financialMonth';
import { dayKeyFromDateLocal, dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';
import {
  addDaysToDayKey,
  filterRecurringRulesByWallet,
  projectRecurringOccurrences,
  recurringAmountPerMonth,
  recurringMonthlyExpenseTotal,
} from '~/utils/recurringRules';
import { countsAsExpenseRow } from '~/utils/spending';

const MS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;
/** Days in the pill strip above the timeline. */
const WEEK_LENGTH = 7;

const EVERY_KEY_BY_PATTERN: Record<RecurringTransactionRule['recurrencePattern'], string> = {
  daily: 'recurring.every_days',
  weekly: 'recurring.every_weeks',
  monthly: 'recurring.every_months',
  yearly: 'recurring.every_years',
};

function formatCadence(
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): string {
  // interval 1 reads as a plain adjective ("Monthly"); >1 as "Every N months".
  if (interval <= 1) return I18n.t(`transactions.editor.${pattern}`);
  return I18n.t(EVERY_KEY_BY_PATTERN[pattern], { count: interval });
}

function dayKeyToDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function daysBetweenDayKeys(from: string, to: string): number {
  return Math.round((dayKeyToDate(to).getTime() - dayKeyToDate(from).getTime()) / MS_PER_DAY);
}

/** "Today" / "Tomorrow" / the weekday name. */
function formatDayHeading(dayKey: string, todayKey: string): string {
  const days = daysBetweenDayKeys(todayKey, dayKey);
  if (days <= 0) return I18n.t('common.today');
  if (days === 1) return I18n.t('recurring.due_tomorrow');
  return new Intl.DateTimeFormat(I18n.locale, { weekday: 'long' }).format(dayKeyToDate(dayKey));
}

type ListRow =
  | {
      kind: 'dayHeader';
      key: string;
      label: string;
      dateLabel: string;
      totalLabel: string;
      isToday: boolean;
    }
  | { kind: 'timelineCard'; key: string; isLast: boolean; card: RecurringCommitmentCardProps }
  | { kind: 'sectionHeader'; key: string; label: string }
  | { kind: 'card'; key: string; card: RecurringCommitmentCardProps };

interface RecurringScreenProps {
  onBack: () => void;
  onOpenEditor: (ruleId?: string) => void;
  useNativeBackGesture?: boolean;
}

export function RecurringScreen({
  onBack,
  onOpenEditor,
  useNativeBackGesture = false,
}: RecurringScreenProps) {
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const {
    settings,
    recurringRules,
    deleteRecurringRule,
    isSimpleMode,
    simpleWalletId,
    getCategoryById,
    getTrueHourlyRateForDate,
    rateTable,
  } = useApp();
  const { checkLimit } = useProGate();

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const todayKey = dayKeyFromDateLocal(new Date());

  const allRules = useMemo(
    () =>
      isSimpleMode ? filterRecurringRulesByWallet(recurringRules, simpleWalletId) : recurringRules,
    [isSimpleMode, simpleWalletId, recurringRules],
  );

  const hourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );

  const reportingCurrency = settings.currencyCode;

  // A rule stores the currency it was entered in, which is not always the
  // reporting currency (e.g. an RM car loan on a Malaysian account while the
  // app reports in SGD). Anything that is summed or shown next to the main
  // currency symbol has to be converted first.
  const toReporting = useCallback(
    (amount: number, currency: string) =>
      currency === reportingCurrency
        ? amount
        : convert(amount, currency, reportingCurrency, rateTable).value,
    [rateTable, reportingCurrency],
  );

  /**
   * Format an amount held in `currency`. Money mode keeps the rule's own
   * currency symbol; time mode converts to the reporting currency first,
   * because the hourly rate is expressed in that currency.
   */
  const formatValue = useCallback(
    (amount: number, currency: string = reportingCurrency) => {
      const formatSettings = {
        currencySymbol: settings.currencySymbol,
        displayMode: settings.displayMode,
        workdayDisplayEnabled: settings.workdayDisplayEnabled,
        workingHoursPerDay: settings.workingHoursPerDay,
      };
      if (settings.displayMode === 'time' && hourlyRate > 0) {
        return formatAmount(toReporting(amount, currency), formatSettings, {
          showSign: false,
          trueHourlyRate: hourlyRate,
        });
      }
      return formatAmount(amount, formatSettings, {
        showSign: false,
        trueHourlyRate: hourlyRate,
        // Only override the symbol for foreign amounts: the reporting symbol is
        // user-configurable and may differ from the ISO default.
        currencyCode: currency === reportingCurrency ? undefined : currency,
      });
    },
    [
      settings.currencySymbol,
      settings.displayMode,
      settings.workdayDisplayEnabled,
      settings.workingHoursPerDay,
      hourlyRate,
      reportingCurrency,
      toReporting,
    ],
  );

  const monthlyExpense = useMemo(
    () => recurringMonthlyExpenseTotal(allRules, toReporting),
    [allRules, toReporting],
  );

  /**
   * What is still to be charged before this financial month closes: the figure
   * that answers "how much of the rest of my month is already spoken for".
   *
   * This is the one number that needs the full projection rather than each
   * rule's next run, because a weekly rule can charge four more times before
   * the month is out.
   */
  const leftThisMonth = useMemo(() => {
    const firstDay = settings.firstDayOfMonth;
    const { endInclusive } = financialMonthRange(
      financialMonthKeyForDate(dayKeyToDate(todayKey), firstDay),
      firstDay,
    );
    const days = Math.max(1, daysBetweenDayKeys(todayKey, dayKeyFromDateLocal(endInclusive)) + 1);
    return projectRecurringOccurrences(allRules, { fromDayKey: todayKey, days }).reduce(
      (total, occurrence) =>
        countsAsExpenseRow(occurrence.rule)
          ? total + toReporting(occurrence.rule.amount, occurrence.rule.currency)
          : total,
      0,
    );
  }, [allRules, settings.firstDayOfMonth, todayKey, toReporting]);

  /**
   * Active rules bucketed by the day they next charge, in date order. One entry
   * per rule, not per projected occurrence: this list doubles as the full
   * manage-your-commitments list, so a weekly rule repeated across the horizon
   * would put four of everything (its delete button included) on screen.
   *
   * A rule whose run date has already passed is bucketed under today. The
   * runner catches those up on the next app load, and a past day is somewhere
   * the list would never scroll to.
   */
  const rulesByDay = useMemo(() => {
    const byDay = new Map<string, RecurringTransactionRule[]>();
    allRules
      .filter((rule) => rule.isActive)
      .forEach((rule) => {
        const runDay = dayKeyFromIsoLocal(rule.nextRunDate);
        const dayKey = runDay < todayKey ? todayKey : runDay;
        const bucket = byDay.get(dayKey);
        if (bucket) bucket.push(rule);
        else byDay.set(dayKey, [rule]);
      });
    return new Map([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [allRules, todayKey]);

  const pausedRules = useMemo(() => allRules.filter((rule) => !rule.isActive), [allRules]);

  /**
   * The day filter actually in force. Derived rather than read straight from
   * state so that deleting or pausing the last rule on the selected day falls
   * back to the whole timeline, instead of leaving the screen filtered to a day
   * that no longer has anything on it.
   */
  const activeDayKey = selectedDayKey && rulesByDay.has(selectedDayKey) ? selectedDayKey : null;

  const weekDays = useMemo<WeekStripDay[]>(() => {
    const weekday = new Intl.DateTimeFormat(I18n.locale, { weekday: 'narrow' });
    return Array.from({ length: WEEK_LENGTH }, (_, index) => {
      const dayKey = addDaysToDayKey(todayKey, index);
      const date = dayKeyToDate(dayKey);
      return {
        dayKey,
        weekdayLabel: weekday.format(date),
        dayLabel: String(date.getDate()),
        isToday: index === 0,
        count: rulesByDay.get(dayKey)?.length ?? 0,
      };
    });
  }, [rulesByDay, todayKey]);

  const openCreate = useCallback(() => {
    if (!checkLimit('recurring', recurringRules.length)) return;
    onOpenEditor();
  }, [checkLimit, onOpenEditor, recurringRules.length]);

  const openEdit = useCallback((id: string) => onOpenEditor(id), [onOpenEditor]);

  const handleDeleteRule = useCallback(
    (id: string, name: string) => {
      Alert.alert(I18n.t('recurring.delete_rule'), I18n.t('recurring.delete_confirm', { name }), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => deleteRecurringRule(id),
        },
      ]);
    },
    [deleteRecurringRule],
  );

  /** Everything a card needs about one rule, whichever section it lands in. */
  const cardFor = useCallback(
    (
      rule: RecurringTransactionRule,
      badge: RecurringCommitmentCardProps['badge'],
    ): RecurringCommitmentCardProps => {
      const category = rule.categoryId ? getCategoryById(rule.categoryId) : undefined;
      const parent = category?.parentId ? getCategoryById(category.parentId) : undefined;
      const reportingAmount = toReporting(rule.amount, rule.currency);
      const perMonth = recurringAmountPerMonth(
        reportingAmount,
        rule.recurrencePattern,
        rule.recurrenceInterval,
      );
      // Monthly/interval-1 rules already equal their monthly total, so the line
      // would just repeat the amount. A foreign-currency rule still owes its
      // main-currency equivalent, the way the editor shows it under the amount.
      const isMonthlyEquivRedundant =
        rule.recurrencePattern === 'monthly' && rule.recurrenceInterval === 1;
      const showReportingEquiv =
        rule.currency !== reportingCurrency && settings.displayMode === 'money';

      return {
        ruleId: rule.id,
        name: rule.name,
        type: rule.type,
        isActive: rule.isActive,
        amountLabel: formatValue(rule.amount, rule.currency),
        amountNoteLabel: !isMonthlyEquivRedundant
          ? I18n.t('recurring.approx_per_month', { amount: formatValue(perMonth) })
          : showReportingEquiv
            ? `≈ ${formatValue(reportingAmount)}`
            : undefined,
        metaLabel: formatCadence(rule.recurrencePattern, rule.recurrenceInterval),
        badge,
        categoryIcon: category?.icon ?? null,
        categoryParentIcon: parent?.icon ?? null,
        logoId: rule.logoId,
        onPress: openEdit,
        onDelete: handleDeleteRule,
      };
    },
    [
      formatValue,
      getCategoryById,
      handleDeleteRule,
      openEdit,
      reportingCurrency,
      settings.displayMode,
      toReporting,
    ],
  );

  const rows = useMemo<ListRow[]>(() => {
    const result: ListRow[] = [];
    const days = [...rulesByDay.entries()].filter(
      ([dayKey]) => !activeDayKey || dayKey === activeDayKey,
    );

    days.forEach(([dayKey, dayRules], dayIndex) => {
      const dayTotal = dayRules.reduce(
        (sum, rule) =>
          countsAsExpenseRow(rule) ? sum + toReporting(rule.amount, rule.currency) : sum,
        0,
      );
      result.push({
        kind: 'dayHeader',
        key: `day-${dayKey}`,
        label: formatDayHeading(dayKey, todayKey),
        dateLabel: new Intl.DateTimeFormat(I18n.locale, {
          month: 'short',
          day: 'numeric',
        }).format(dayKeyToDate(dayKey)),
        totalLabel: dayTotal > 0 ? formatValue(dayTotal) : '',
        isToday: dayKey === todayKey,
      });

      dayRules.forEach((rule, index) => {
        const overdue = dayKeyFromIsoLocal(rule.nextRunDate) < todayKey;
        result.push({
          kind: 'timelineCard',
          key: `rule-${rule.id}`,
          isLast: dayIndex === days.length - 1 && index === dayRules.length - 1,
          card: cardFor(rule, overdue ? 'overdue' : null),
        });
      });
    });

    // Paused rules never charge, so they sit off the timeline rather than being
    // given a run date the app is not going to act on.
    if (pausedRules.length > 0 && !activeDayKey) {
      result.push({
        kind: 'sectionHeader',
        key: 'section-paused',
        label: I18n.t('recurring.paused_section'),
      });
      pausedRules.forEach((rule) => {
        result.push({ kind: 'card', key: `paused-${rule.id}`, card: cardFor(rule, 'paused') });
      });
    }

    return result;
  }, [activeDayKey, cardFor, formatValue, pausedRules, rulesByDay, todayKey, toReporting]);

  const listHeader = useMemo(() => {
    if (allRules.length === 0) return null;
    return (
      <View className="gap-5 pb-4 pt-1">
        <RecurringSummary
          monthlyLabel={formatValue(monthlyExpense)}
          leftThisMonthLabel={formatValue(leftThisMonth)}
          yearlyLabel={formatValue(monthlyExpense * MONTHS_PER_YEAR)}
          activeCount={allRules.length - pausedRules.length}
        />
        <RecurringWeekStrip
          days={weekDays}
          selectedDayKey={activeDayKey}
          onSelectDay={setSelectedDayKey}
        />
      </View>
    );
  }, [
    activeDayKey,
    allRules.length,
    formatValue,
    leftThisMonth,
    monthlyExpense,
    pausedRules.length,
    weekDays,
  ]);

  const listEmpty = useMemo(
    () => (
      <EmptyState
        title={I18n.t('recurring.empty_title')}
        message={I18n.t('recurring.empty_message')}
        mascotMood="curious"
        action={{ label: I18n.t('recurring.create_commitment'), onPress: openCreate }}
      />
    ),
    [openCreate],
  );

  const keyExtractor = useCallback((row: ListRow) => row.key, []);

  const renderRow = useCallback(({ item }: { item: ListRow }) => {
    switch (item.kind) {
      case 'dayHeader':
        return (
          <View className="flex-row gap-2">
            <TimelineRail variant="head" isToday={item.isToday} />
            <View className="flex-1">
              <TimelineDayHeader
                label={item.label}
                dateLabel={item.dateLabel}
                totalLabel={item.totalLabel}
                isToday={item.isToday}
              />
            </View>
          </View>
        );
      case 'timelineCard':
        return (
          <View className="flex-row gap-2">
            <TimelineRail variant={item.isLast ? 'tail' : 'body'} />
            <View className="flex-1 pb-2">
              <RecurringCommitmentCard {...item.card} />
            </View>
          </View>
        );
      case 'sectionHeader':
        return (
          <Text variant="label" tone="muted" className="pb-2 pt-5">
            {item.label}
          </Text>
        );
      case 'card':
        return (
          <View className="pb-2">
            <RecurringCommitmentCard {...item.card} />
          </View>
        );
    }
  }, []);

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onBack}
          title={I18n.t('recurring.title')}
          rightAccessory={
            <AddIconButton onPress={openCreate} accessibilityLabel={I18n.t('recurring.new_rule')} />
          }
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listContent, bottomNavInset]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderItem={renderRow}
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
      />
    </SettingsPageLayout>
  );

  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
});
