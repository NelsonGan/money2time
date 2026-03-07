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
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  getScrollToTopRef: (index: number) => MutableRefObject<ScrollToTopHandler>;
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
  selectedTransactionIds = [],
  selectionMode = false,
  getScrollToTopRef,
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
        selectedTransactionIds={selectedTransactionIds}
        selectionMode={selectionMode}
        emptyTitle={I18n.t('transactions.empty_month_title')}
        emptyMessage={I18n.t('transactions.empty_month_message')}
        contentPaddingBottom={LIST_BOTTOM_PADDING}
        disableItemAnimations
        compactItems
        listKey={`${pageMonthKey}-${localeKey}`}
        scrollToTopRef={getScrollToTopRef(item)}
      />
    </View>
  );
});
