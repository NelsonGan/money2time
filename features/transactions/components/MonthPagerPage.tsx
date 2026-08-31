import React, { memo, type MutableRefObject, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import type { MonthCycleInput, TransactionWithRelations } from '~/types';
import { addFinancialMonths, financialMonthKeyForDate } from '~/utils/financialMonth';

import {
  ActivityTransactionList,
  type TransactionDisplaySettings,
} from './ActivityTransactionList';

type ScrollToTopHandler = (() => void) | null;
type ScrollToDayHandler = ((dayKey: string) => void) | null;

interface MonthPagerPageProps {
  item: number;
  monthPagerAnchorDate: Date;
  centerIndex: number;
  /** Financial month start day (1..28). Defaults to 1 = plain calendar months. */
  monthCycle?: MonthCycleInput;
  localeKey: string;
  monthPageStyle: StyleProp<ViewStyle>;
  monthTransactionsMap: Map<string, TransactionWithRelations[]>;
  displaySettings: TransactionDisplaySettings;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  /** `settings.reimbursementsCountAsExpense`; see ActivityTransactionList. */
  reimbursementsCountAsExpense?: boolean;
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  onTransactionSplitBadgePress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  onToggleDaySelection?: (transactionIds: string[]) => void;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
  getScrollToDayRef?: (index: number) => MutableRefObject<ScrollToDayHandler>;
  contentPaddingHorizontal?: number;
  /**
   * Pad below the oldest day's section so scroll-to-day can land its header at
   * the top of the viewport. Only useful for pagers that scroll to days (the
   * calendar home list) — leave off elsewhere to skip the measuring machinery
   * and the trailing blank it adds.
   */
  fillLastSectionToViewport?: boolean;
  /** Flash a just-created transaction's row (see ActivityTransactionList). */
  highlightOnCreate?: boolean;
}

const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

export const MonthPagerPage = memo(function MonthPagerPage({
  item,
  monthPagerAnchorDate,
  centerIndex,
  monthCycle = 1,
  localeKey,
  monthPageStyle,
  monthTransactionsMap,
  displaySettings,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  reimbursementsCountAsExpense,
  onTransactionPress,
  onTransactionLongPress,
  onTransactionSplitBadgePress,
  selectedTransactionIds = [],
  selectionMode = false,
  onToggleDaySelection,
  getScrollToTopRef,
  getScrollToDayRef,
  contentPaddingHorizontal,
  fillLastSectionToViewport = false,
  highlightOnCreate = false,
}: MonthPagerPageProps) {
  const monthDate = useMemo(
    () => addFinancialMonths(monthPagerAnchorDate, item - centerIndex, monthCycle),
    [centerIndex, item, monthPagerAnchorDate, monthCycle],
  );
  const pageMonthKey = financialMonthKeyForDate(monthDate, monthCycle);
  const pageTransactions = monthTransactionsMap.get(pageMonthKey) ?? EMPTY_TRANSACTIONS;

  return (
    <View style={monthPageStyle} className="flex-1 bg-background">
      <ActivityTransactionList
        transactions={pageTransactions}
        locale={localeKey}
        displaySettings={displaySettings}
        getDisplayValueForTransaction={getDisplayValueForTransaction}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        reimbursementsCountAsExpense={reimbursementsCountAsExpense}
        onTransactionPress={onTransactionPress}
        onTransactionLongPress={onTransactionLongPress}
        onTransactionSplitBadgePress={onTransactionSplitBadgePress}
        selectedTransactionIds={selectedTransactionIds}
        selectionMode={selectionMode}
        onToggleDaySelection={onToggleDaySelection}
        emptyTitle={I18n.t('transactions.empty_month_title')}
        emptyMessage={I18n.t('transactions.empty_month_message')}
        contentPaddingBottom={LIST_BOTTOM_PADDING}
        contentPaddingHorizontal={contentPaddingHorizontal}
        extendUnderBottomNav
        fillLastSectionToViewport={fillLastSectionToViewport}
        highlightOnCreate={highlightOnCreate}
        disableItemAnimations
        compactItems
        listKey={`${pageMonthKey}-${localeKey}`}
        scrollToTopRef={getScrollToTopRef(item)}
        scrollToDayRef={getScrollToDayRef?.(item)}
      />
    </View>
  );
});
