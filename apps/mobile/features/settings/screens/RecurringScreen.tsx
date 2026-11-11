import { Settings2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { ADD_FAB_SIZE, AddFabButton } from '~/components/navigation/AddFab';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  HeaderIconButton,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
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
import {
  NO_RECURRING_RULE_FEE,
  recurringRuleChargesFee,
} from '~/features/transactions/lib/transferFee';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RecurringTransactionRule } from '~/types';
import { convert } from '~/utils/currency';
import {
  financialMonthKeyForDate,
  financialMonthRange,
  financialYearEndForDate,
  monthCycleOf,
} from '~/utils/financialMonth';
import {
  dateFromDayKeyLocal,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatAmount,
} from '~/utils/formatters';
import {
  addDaysToDayKey,
  recurrenceFrequencyOf,
  recurringAmountPerMonth,
  recurringExpenseDueBetween,
  recurringMonthlyExpenseTotal,
  recurringRunSpend,
} from '~/utils/recurringRules';

const MS_PER_DAY = 86_400_000;
/** Space between the + and what it sits above (the bar, or the home indicator). */
const FAB_BOTTOM_GAP = 12;
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
  // Every 3 or 6 months reads as "Quarterly" / "Semi-annually", including
  // schedules created through a different frequency and interval.
  const cadence = recurrenceFrequencyOf(pattern, interval);
  // interval 1 reads as a plain adjective ("Monthly"); >1 as "Every N months".
  if (cadence.interval <= 1) return I18n.t(`transactions.editor.${cadence.frequency}`);
  return I18n.t(EVERY_KEY_BY_PATTERN[pattern], { count: interval });
}

function daysBetweenDayKeys(from: string, to: string): number {
  return Math.round(
    (dateFromDayKeyLocal(to).getTime() - dateFromDayKeyLocal(from).getTime()) / MS_PER_DAY,
  );
}

/** "Today" / "Tomorrow" / the weekday name. */
function formatDayHeading(dayKey: string, todayKey: string): string {
  const days = daysBetweenDayKeys(todayKey, dayKey);
  if (days <= 0) return I18n.t('common.today');
  if (days === 1) return I18n.t('recurring.due_tomorrow');
  return new Intl.DateTimeFormat(I18n.locale, { weekday: 'long' }).format(
    dateFromDayKeyLocal(dayKey),
  );
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
  /** Omitted when the page sits in the bottom bar, which hides the back button. */
  onBack?: () => void;
  onOpenEditor: (ruleId?: string) => void;
  /** The gear in the header: Recurring settings. */
  onOpenSettings: () => void;
  useNativeBackGesture?: boolean;
}

export function RecurringScreen({
  onBack,
  onOpenEditor,
  onOpenSettings,
  useNativeBackGesture = false,
}: RecurringScreenProps) {
  const themeColors = useThemeColors();
  // The + sits bottom right like Home's: above the floating bar in the tab
  // shell, above the home indicator on the root-stack page (no bar there).
  const navInset = useBottomNavContentInset();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const fabBottom = (navInset > 0 ? navInset : safeBottom) + FAB_BOTTOM_GAP;
  // The last card can scroll clear of the +.
  const listBottomPadding = fabBottom + ADD_FAB_SIZE + SETTINGS_LIST_BOTTOM_PADDING;
  const {
    settings,
    accounts,
    recurringRules: storedRules,
    deleteRecurringRule,
    getCategoryById,
    getTrueHourlyRateForDate,
    rateTable,
  } = useApp();
  // A fee the runner will not write (its paying account became a loan or is
  // gone) is neither shown nor counted.
  const recurringRules = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    return storedRules.map((rule) =>
      rule.feeAmount != null && !recurringRuleChargesFee(rule, (id) => accountById.get(id))
        ? { ...rule, ...NO_RECURRING_RULE_FEE }
        : rule,
    );
  }, [accounts, storedRules]);
  const monthCycle = monthCycleOf(settings);
  const { checkLimit } = useProGate();

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const todayKey = dayKeyFromDateLocal(new Date());

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
    () => recurringMonthlyExpenseTotal(recurringRules, toReporting),
    [recurringRules, toReporting],
  );

  /**
   * What is still to be charged from today to the end of this financial month,
   * and to the end of this year (see `financialYearEndForDate`): the actual
   * upcoming payments, not each rule's per-month average. A rule that
   * only starts in a later year adds nothing to either figure.
   */
  const { dueThisMonth, dueThisYear } = useMemo(() => {
    const today = dateFromDayKeyLocal(todayKey);
    const monthKey = financialMonthKeyForDate(today, monthCycle);
    const monthEnd = dayKeyFromDateLocal(financialMonthRange(monthKey, monthCycle).endInclusive);
    const yearEnd = dayKeyFromDateLocal(financialYearEndForDate(today, monthCycle));
    return {
      dueThisMonth: recurringExpenseDueBetween(recurringRules, todayKey, monthEnd, toReporting),
      dueThisYear: recurringExpenseDueBetween(recurringRules, todayKey, yearEnd, toReporting),
    };
  }, [recurringRules, monthCycle, todayKey, toReporting]);

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
    recurringRules
      .filter((rule) => rule.isActive)
      .forEach((rule) => {
        const runDay = dayKeyFromIsoLocal(rule.nextRunDate);
        const dayKey = runDay < todayKey ? todayKey : runDay;
        const bucket = byDay.get(dayKey);
        if (bucket) bucket.push(rule);
        else byDay.set(dayKey, [rule]);
      });
    return new Map([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [recurringRules, todayKey]);
  const pausedRules = useMemo(
    () => recurringRules.filter((rule) => !rule.isActive),
    [recurringRules],
  );

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
      const date = dateFromDayKeyLocal(dayKey);
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
        feeLabel:
          rule.type === 'transfer' && rule.feeAmount && rule.feeCurrency
            ? I18n.t('transactions.editor.transfer_fee.chip_active', {
                amount: formatValue(rule.feeAmount, rule.feeCurrency),
              })
            : undefined,
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
        (sum, rule) => sum + recurringRunSpend(rule, toReporting),
        0,
      );
      result.push({
        kind: 'dayHeader',
        key: `day-${dayKey}`,
        label: formatDayHeading(dayKey, todayKey),
        dateLabel: new Intl.DateTimeFormat(I18n.locale, {
          month: 'short',
          day: 'numeric',
        }).format(dateFromDayKeyLocal(dayKey)),
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
    if (recurringRules.length === 0) return undefined;
    return (
      <View className="gap-5 pb-4 pt-1">
        <RecurringSummary
          monthlyLabel={formatValue(monthlyExpense)}
          thisMonthLabel={formatValue(dueThisMonth)}
          thisYearLabel={formatValue(dueThisYear)}
          activeCount={recurringRules.length - pausedRules.length}
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
    recurringRules.length,
    dueThisMonth,
    dueThisYear,
    formatValue,
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
            <HeaderIconButton
              onPress={onOpenSettings}
              icon={<Settings2 size={18} color={themeColors.textMuted} />}
              label={I18n.t('recurring.settings_title')}
            />
          }
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderItem={renderRow}
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
      />
      <View pointerEvents="box-none" style={[styles.fab, { bottom: fabBottom }]}>
        <AddFabButton onPress={openCreate} accessibilityLabel={I18n.t('recurring.new_rule')} />
      </View>
    </SettingsPageLayout>
  );

  if (useNativeBackGesture || !onBack) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  // Home's + corner (`AddFab`): the trailing edge, at its margin.
  fab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
});
