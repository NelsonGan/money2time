import React, { memo, type MutableRefObject, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';
import type { TransactionWithRelations } from '~/types';
import { addMonthsAtMonthStart, monthKeyFromDateLocal } from '~/utils/formatters';

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
  localeKey: string;
  monthPageStyle: StyleProp<ViewStyle>;
  monthTransactionsMap: Map<string, TransactionWithRelations[]>;
  displaySettings: TransactionDisplaySettings;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  onTransactionSplitBadgePress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  onToggleDaySelection?: (transactionIds: string[]) => void;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
  getScrollToDayRef?: (index: number) => MutableRefObject<ScrollToDayHandler>;
  contentPaddingHorizontal?: number;
}

const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

export const MonthPagerPage = memo(function MonthPagerPage({
  item,
  monthPagerAnchorDate,
  centerIndex,
  localeKey,
  monthPageStyle,
  monthTransactionsMap,
  displaySettings,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  onTransactionPress,
  onTransactionLongPress,
  onTransactionSplitBadgePress,
  selectedTransactionIds = [],
  selectionMode = false,
  onToggleDaySelection,
  getScrollToTopRef,
  getScrollToDayRef,
  contentPaddingHorizontal,
}: MonthPagerPageProps) {
  const monthDate = useMemo(
    () => addMonthsAtMonthStart(monthPagerAnchorDate, item - centerIndex),
    [centerIndex, item, monthPagerAnchorDate],
  );
  const pageMonthKey = monthKeyFromDateLocal(monthDate);
  const pageTransactions = monthTransactionsMap.get(pageMonthKey) ?? EMPTY_TRANSACTIONS;

  return (
    <View style={monthPageStyle} className="flex-1 bg-background">
      <ActivityTransactionList
        transactions={pageTransactions}
        locale={localeKey}
        displaySettings={displaySettings}
        getDisplayValueForTransaction={getDisplayValueForTransaction}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
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
        disableItemAnimations
        compactItems
        listKey={`${pageMonthKey}-${localeKey}`}
        scrollToTopRef={getScrollToTopRef(item)}
        scrollToDayRef={getScrollToDayRef?.(item)}
      />
    </View>
  );
});
