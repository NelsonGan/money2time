import type { FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  useBottomNavContentInset,
  useBottomNavScrollReporter,
} from '~/components/navigation/BottomNavMinimize';
import { Text, TimeValueInline } from '~/components/ui';
import { LIST_BOTTOM_PADDING } from '~/constants/designSystem';
import { TransactionItem } from '~/features/transactions/components/TransactionItem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { subscribeHighlightTransaction } from '~/services/transactionsNavigation';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromIsoLocal, formatAmount, formatHours } from '~/utils/formatters';

export type TransactionDisplaySettings = Pick<UserSettings, 'currencySymbol' | 'displayMode'>;

type ActivityRow =
  | {
      kind: 'header';
      id: string;
      dateLabel: string;
      weekdayLabel: string;
      incomeSubtotal: number;
      expenseSubtotal: number;
      transactionIds: string[];
    }
  | { kind: 'item'; id: string; transaction: TransactionWithRelations };

const dayLabelFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayLabelWithYearFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatterByLocale = new Map<string, Intl.DateTimeFormat>();
const dayHeaderLabelCache = new Map<string, { dateLabel: string; weekdayLabel: string }>();
const MAINTAIN_VISIBLE_CONTENT_DISABLED = { disabled: true } as const;
// How long the just-created row stays flagged as highlighted, counted from the
// moment the row actually lands in this list (not from the create request).
// Comfortably longer than the row's own fade; the fade itself runs on the UI
// thread and self-completes.
const HIGHLIGHT_CLEAR_MS = 1500;
// How long a highlight request stays pending while waiting for its row to
// appear. The create can trail the request by a while (the editor defers the
// write behind its dismiss animation), but a row landing much later than this
// (e.g. a hidden list catching up on tab activation) shouldn't flash.
const HIGHLIGHT_PENDING_TTL_MS = 5000;

interface ActivityTransactionListProps {
  transactions: TransactionWithRelations[];
  displaySettings: TransactionDisplaySettings;
  /**
   * When set (single-account view), day subtotals are summed in this account's
   * native currency and shown with its symbol, rather than converted to the
   * reporting currency.
   */
  subtotalCurrencyCode?: string | null;
  getDisplayValueForTransaction: (transaction: TransactionWithRelations) => number;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  onTransactionPress?: (transaction: TransactionWithRelations) => void;
  onTransactionLongPress?: (transaction: TransactionWithRelations) => void;
  /** Tap on the unpaid-splits notification badge — overrides the row tap so
   *  the caller can route directly to the Split Bill modal. */
  onTransactionSplitBadgePress?: (transaction: TransactionWithRelations) => void;
  selectedTransactionIds?: string[];
  selectionMode?: boolean;
  /** Toggle selection of every transaction under a day header (select-all). */
  onToggleDaySelection?: (transactionIds: string[]) => void;
  emptyTitle: string;
  emptyMessage: string;
  listHeaderComponent?: React.ReactNode;
  contentPaddingBottom?: number;
  contentPaddingHorizontal?: number;
  contentPaddingTop?: number;
  listKey?: string;
  disableItemAnimations?: boolean;
  disableScrollBounce?: boolean;
  compactItems?: boolean;
  disableVirtualization?: boolean;
  groupByDate?: boolean;
  scrollToTopRef?: React.MutableRefObject<(() => void) | null>;
  /** Scrolls the list to a given day's section header (YYYY-MM-DD). */
  scrollToDayRef?: React.MutableRefObject<((dayKey: string) => void) | null>;
  locale?: string;
  /**
   * Set when this list is a tab screen's main scrollable behind the floating
   * liquid-glass nav bar: adds the bar's reserved inset to the bottom padding
   * and reports scroll so the bar can minimize. No-op in fallback mode.
   */
  extendUnderBottomNav?: boolean;
  /**
   * When set (grouped monthly list, newest-first), the trailing spacer below
   * the list is sized so the oldest day's section — which sorts to the bottom —
   * can be scrolled up so its header sits at the top of the viewport, filling
   * one page. The spacer is measured to be *just* enough (viewport minus the
   * last section's height) so no wasted blank is left below it, and
   * scroll-to-day lands that oldest section at the top via `scrollToEnd`.
   */
  fillLastSectionToViewport?: boolean;
  /**
   * Subscribe to post-create highlight requests and briefly flash the matching
   * row so the user can spot a transaction they just added. Off by default; the
   * calendar month list opts in.
   */
  highlightOnCreate?: boolean;
}

interface DayHeaderRowProps {
  dateLabel: string;
  weekdayLabel: string;
  incomeSubtotal: number;
  expenseSubtotal: number;
  isTimeMode: boolean;
  settings: TransactionDisplaySettings;
  selectionMode: boolean;
  allSelected: boolean;
  /** The day's transaction ids, passed back to `onToggleSelectAll`. Kept as
   *  separate props (rather than a per-header closure built in renderItem) so
   *  this memo isn't defeated on every list re-render pass. */
  transactionIds: string[];
  onToggleSelectAll?: (transactionIds: string[]) => void;
}

const DayHeaderRow = memo(function DayHeaderRow({
  dateLabel,
  weekdayLabel,
  incomeSubtotal,
  expenseSubtotal,
  isTimeMode,
  settings,
  selectionMode,
  allSelected,
  transactionIds,
  onToggleSelectAll,
}: DayHeaderRowProps) {
  const themeColors = useThemeColors();

  return (
    <View className="pt-2 pb-1.5 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {selectionMode ? (
          <Pressable
            onPress={() => onToggleSelectAll?.(transactionIds)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            className={cn(
              'mr-0.5 h-5 w-5 rounded-full border items-center justify-center',
              allSelected ? 'border-primary bg-primary/20' : 'border-border/50 bg-secondary/35',
            )}
          >
            {allSelected ? (
              <Text variant="label" className="text-primary">
                ✓
              </Text>
            ) : null}
          </Pressable>
        ) : null}
        <Text variant="caption" tone="muted">
          {dateLabel}
        </Text>
        <View className="rounded-full border border-border/45 bg-secondary/55 px-2 py-0.5">
          <Text variant="label" tone="muted">
            {weekdayLabel}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {incomeSubtotal !== 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-success/10">
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(Math.abs(incomeSubtotal))}
                variant="caption"
                textClassName="text-success"
                iconColor={themeColors.success}
                iconSize={10}
              />
            ) : (
              <Text variant="caption" className="text-success">
                {formatAmount(incomeSubtotal, settings, { showSign: false })}
              </Text>
            )}
          </View>
        ) : null}
        {expenseSubtotal !== 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-destructive/8">
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(Math.abs(expenseSubtotal))}
                variant="caption"
                textClassName="text-destructive"
                iconColor={themeColors.error}
                iconSize={10}
              />
            ) : (
              <Text variant="caption" className="text-destructive">
                {formatAmount(expenseSubtotal, settings, { showSign: false })}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
});

function dayKeyFromIso(isoDate: string) {
  return dayKeyFromIsoLocal(isoDate);
}

function getDayLabelFormatter(locale: string) {
  const cached = dayLabelFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  });
  dayLabelFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getDayLabelWithYearFormatter(locale: string) {
  const cached = dayLabelWithYearFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  dayLabelWithYearFormatterByLocale.set(locale, formatter);
  return formatter;
}

function getWeekdayFormatter(locale: string) {
  const cached = weekdayFormatterByLocale.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  weekdayFormatterByLocale.set(locale, formatter);
  return formatter;
}

function formatDayHeaderParts(
  dayKey: string,
  locale: string,
): { dateLabel: string; weekdayLabel: string } {
  const currentYear = new Date().getFullYear();
  const cacheKey = `${locale}|${currentYear}|${dayKey}`;
  const cached = dayHeaderLabelCache.get(cacheKey);
  if (cached) return cached;

  const [yearRaw, monthRaw, dayRaw] = dayKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return { dateLabel: dayKey, weekdayLabel: '' };
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return { dateLabel: dayKey, weekdayLabel: '' };

  const dateLabel =
    year !== currentYear
      ? getDayLabelWithYearFormatter(locale).format(date)
      : getDayLabelFormatter(locale).format(date);
  const weekdayLabel = getWeekdayFormatter(locale).format(date);
  const next = { dateLabel, weekdayLabel };
  dayHeaderLabelCache.set(cacheKey, next);

  return next;
}

export const ActivityTransactionList = memo(function ActivityTransactionList({
  transactions,
  displaySettings,
  subtotalCurrencyCode,
  getDisplayValueForTransaction,
  getTrueHourlyRateForDate,
  onTransactionPress,
  onTransactionLongPress,
  onTransactionSplitBadgePress,
  selectedTransactionIds = [],
  selectionMode = false,
  onToggleDaySelection,
  emptyTitle,
  emptyMessage,
  listHeaderComponent,
  contentPaddingBottom = LIST_BOTTOM_PADDING,
  contentPaddingHorizontal = 18,
  contentPaddingTop = 4,
  listKey,
  disableItemAnimations = false,
  disableScrollBounce = false,
  compactItems = false,
  disableVirtualization = false,
  groupByDate = true,
  scrollToTopRef,
  scrollToDayRef,
  locale = I18n.locale ?? 'en',
  extendUnderBottomNav = false,
  fillLastSectionToViewport = false,
  highlightOnCreate = false,
}: ActivityTransactionListProps) {
  const flashListRef = useRef<FlashListRef<ActivityRow> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const bottomNavInset = useBottomNavContentInset();
  const reportBottomNavScroll = useBottomNavScrollReporter();
  const navScrollProps = extendUnderBottomNav
    ? ({ onScroll: reportBottomNavScroll, scrollEventThrottle: 32 } as const)
    : undefined;
  const isTimeMode = displaySettings.displayMode === 'time';
  const selectedTransactionIdSet = useMemo(
    () => new Set(selectedTransactionIds),
    [selectedTransactionIds],
  );

  // Row to briefly flash right after it's created. Every opted-in list hears
  // the request, but it's held as a pending ref (no render) until the row
  // actually arrives in THIS list's data — so the other mounted month pages
  // never re-render for it, and the flash window starts when the row is
  // actually visible instead of being eaten by a slow deferred create.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pendingHighlightRef = useRef<{ id: string; requestedAt: number } | null>(null);
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo<ActivityRow[]>(() => {
    if (!groupByDate) {
      return transactions.map((transaction) => ({
        kind: 'item',
        id: transaction.id,
        transaction,
      }));
    }

    const dailyTotals = new Map<string, { income: number; expense: number }>();
    const headerRowsByDay = new Map<string, Extract<ActivityRow, { kind: 'header' }>[]>();
    const transactionIdsByDay = new Map<string, string[]>();
    const nextRows: ActivityRow[] = [];
    let currentHeaderDay: string | null = null;

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      const dayTotals = dailyTotals.get(dayKey) ?? { income: 0, expense: 0 };
      if (transaction.type === 'income') {
        const value = isTimeMode
          ? getDisplayValueForTransaction(transaction)
          : subtotalCurrencyCode
            ? (transaction.accountAmount ?? transaction.amount)
            : (transaction.reportingAmount ?? transaction.amount);
        dayTotals.income += value;
      }
      if (transaction.type === 'expense') {
        const value = isTimeMode
          ? getDisplayValueForTransaction(transaction)
          : subtotalCurrencyCode
            ? (transaction.accountAmount ?? transaction.amount)
            : (transaction.reportingAmount ?? transaction.amount);
        dayTotals.expense += value;
      }
      dailyTotals.set(dayKey, dayTotals);

      if (dayKey !== currentHeaderDay) {
        currentHeaderDay = dayKey;
        const { dateLabel, weekdayLabel } = formatDayHeaderParts(dayKey, locale);
        const headerRow: Extract<ActivityRow, { kind: 'header' }> = {
          kind: 'header',
          id: `header-${dayKey}`,
          dateLabel,
          weekdayLabel,
          incomeSubtotal: 0,
          expenseSubtotal: 0,
          transactionIds: [],
        };
        const dayHeaders = headerRowsByDay.get(dayKey);
        if (dayHeaders) {
          dayHeaders.push(headerRow);
        } else {
          headerRowsByDay.set(dayKey, [headerRow]);
        }
        nextRows.push(headerRow);
      }
      const dayIds = transactionIdsByDay.get(dayKey);
      if (dayIds) {
        dayIds.push(transaction.id);
      } else {
        transactionIdsByDay.set(dayKey, [transaction.id]);
      }
      nextRows.push({ kind: 'item', id: transaction.id, transaction });
    });

    headerRowsByDay.forEach((headerRows, dayKey) => {
      const totals = dailyTotals.get(dayKey);
      const dayIds = transactionIdsByDay.get(dayKey) ?? [];
      headerRows.forEach((headerRow) => {
        if (totals) {
          headerRow.incomeSubtotal = totals.income;
          headerRow.expenseSubtotal = totals.expense;
        }
        headerRow.transactionIds = dayIds;
      });
    });

    return nextRows;
  }, [
    getDisplayValueForTransaction,
    groupByDate,
    isTimeMode,
    locale,
    subtotalCurrencyCode,
    transactions,
  ]);

  // Render-synced ref so long-lived imperative handlers (scroll-to-day and its
  // retry timers, the highlight subscription) always read the latest rows
  // without re-creating themselves on every data change.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Promote a pending highlight to state once its row exists in the given rows
  // snapshot; the clear timer starts here, when the flash can actually be seen.
  const promotePendingHighlight = useCallback((liveRows: ActivityRow[]) => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;
    if (Date.now() - pending.requestedAt > HIGHLIGHT_PENDING_TTL_MS) {
      pendingHighlightRef.current = null;
      return;
    }
    if (!liveRows.some((row) => row.kind === 'item' && row.id === pending.id)) return;
    pendingHighlightRef.current = null;
    setHighlightedId(pending.id);
    if (highlightClearTimerRef.current) clearTimeout(highlightClearTimerRef.current);
    highlightClearTimerRef.current = setTimeout(() => {
      highlightClearTimerRef.current = null;
      setHighlightedId(null);
    }, HIGHLIGHT_CLEAR_MS);
  }, []);

  useEffect(() => {
    if (!highlightOnCreate) return;
    const unsubscribe = subscribeHighlightTransaction((id) => {
      pendingHighlightRef.current = { id, requestedAt: Date.now() };
      // The row is usually not in state yet (the request fires in the same task
      // as the optimistic insert), but check anyway in case it already landed.
      promotePendingHighlight(rowsRef.current);
    });
    return () => {
      unsubscribe();
      if (highlightClearTimerRef.current) {
        clearTimeout(highlightClearTimerRef.current);
        highlightClearTimerRef.current = null;
      }
    };
  }, [highlightOnCreate, promotePendingHighlight]);

  // The created row arrives via a data update — re-check on every rows change
  // (no-op unless a highlight is pending).
  useEffect(() => {
    promotePendingHighlight(rows);
  }, [rows, promotePendingHighlight]);

  // Day subtotals in a single-account view use that account's symbol; otherwise
  // the reporting-currency symbol from displaySettings.
  const subtotalSettings = useMemo<TransactionDisplaySettings>(
    () =>
      subtotalCurrencyCode
        ? { ...displaySettings, currencySymbol: currencySymbolForCode(subtotalCurrencyCode) }
        : displaySettings,
    [displaySettings, subtotalCurrencyCode],
  );

  // --- Trailing spacer so the oldest (bottom) day can scroll to the top ---
  // Only active for the grouped monthly list (`fillLastSectionToViewport`). The
  // oldest day sorts to the bottom; to let its header reach the top of the
  // viewport we need scroll room below it. We size that room to exactly
  // `viewport - lastSectionHeight` so the oldest section fills one page with no
  // extra blank. Until the section is measured we leave a full viewport of room
  // (generous) so a scroll-to-day still has somewhere to travel.
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [lastSectionHeight, setLastSectionHeight] = useState(0);
  const rowHeightsRef = useRef(new Map<string, number>());

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    setListViewportHeight(event.nativeEvent.layout.height);
  }, []);

  const lastHeaderIndex = useMemo(() => {
    if (!fillLastSectionToViewport || !groupByDate) return -1;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].kind === 'header') return i;
    }
    return -1;
  }, [fillLastSectionToViewport, groupByDate, rows]);

  // Render-synced ref for the imperative scroll-to-day handler (see below).
  const lastHeaderIndexRef = useRef(lastHeaderIndex);
  lastHeaderIndexRef.current = lastHeaderIndex;

  // Content-compared against the previous set so a rows-identity change that
  // keeps the same trailing section (e.g. the optimistic row being swapped for
  // its persisted copy) doesn't churn getItemType / renderRow / the pruning
  // effect below — each of which repaints every visible cell.
  const prevLastSectionRowIdsRef = useRef<Set<string> | null>(null);
  const lastSectionRowIds = useMemo<Set<string> | null>(() => {
    if (lastHeaderIndex < 0) {
      prevLastSectionRowIdsRef.current = null;
      return null;
    }
    const next = new Set(rows.slice(lastHeaderIndex).map((row) => row.id));
    const prev = prevLastSectionRowIdsRef.current;
    if (prev && prev.size === next.size) {
      let same = true;
      for (const id of next) {
        if (!prev.has(id)) {
          same = false;
          break;
        }
      }
      if (same) return prev;
    }
    prevLastSectionRowIdsRef.current = next;
    return next;
  }, [lastHeaderIndex, rows]);

  const recomputeLastSectionHeight = useCallback(
    (resetIfIncomplete: boolean) => {
      if (!lastSectionRowIds) return;
      let sum = 0;
      let allMeasured = true;
      lastSectionRowIds.forEach((id) => {
        const height = rowHeightsRef.current.get(id);
        if (height == null) {
          allMeasured = false;
        } else {
          sum += height;
        }
      });
      if (allMeasured) {
        setLastSectionHeight((prev) => (prev === sum ? prev : sum));
      } else if (resetIfIncomplete) {
        // The section membership just changed: drop the previous section's
        // stale height and fall back to 0 (a generous full-viewport spacer)
        // until the new rows finish measuring, instead of sizing the spacer
        // from rows that are no longer the trailing section.
        setLastSectionHeight(0);
      }
    },
    [lastSectionRowIds],
  );

  // The trailing section changed (new day, filter, month page, etc.). Drop
  // measured heights for rows that are no longer in it so the map stays bounded
  // to the current section instead of accumulating ids as the pager moves
  // through months, then re-derive the height from whatever is already measured.
  useEffect(() => {
    const heights = rowHeightsRef.current;
    if (!lastSectionRowIds) {
      heights.clear();
    } else {
      for (const id of heights.keys()) {
        if (!lastSectionRowIds.has(id)) heights.delete(id);
      }
    }
    recomputeLastSectionHeight(true);
  }, [lastSectionRowIds, recomputeLastSectionHeight]);

  const measureSectionRow = useCallback(
    (id: string, height: number) => {
      // Round to whole pixels so sub-pixel layout jitter during scroll doesn't
      // churn state (and the spacer) frame after frame.
      const rounded = Math.round(height);
      if (rowHeightsRef.current.get(id) === rounded) return;
      rowHeightsRef.current.set(id, rounded);
      recomputeLastSectionHeight(false);
    },
    [recomputeLastSectionHeight],
  );

  const baseBottomPadding = contentPaddingBottom + (extendUnderBottomNav ? bottomNavInset : 0);
  const lastSectionSpacer =
    lastHeaderIndex >= 0 && listViewportHeight > 0
      ? Math.max(0, listViewportHeight - lastSectionHeight - baseBottomPadding)
      : 0;
  // Read by the scroll-to-day callback so it can pick the right strategy for the
  // oldest section without re-creating (and cancelling the retry timers on) the
  // effect whenever the spacer settles.
  const lastSectionSpacerRef = useRef(0);
  lastSectionSpacerRef.current = lastSectionSpacer;

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: baseBottomPadding + lastSectionSpacer,
      paddingHorizontal: contentPaddingHorizontal,
      paddingTop: contentPaddingTop,
    }),
    [baseBottomPadding, contentPaddingHorizontal, contentPaddingTop, lastSectionSpacer],
  );

  const keyExtractor = useCallback((item: ActivityRow) => item.id, []);
  // Trailing (oldest-section) rows render wrapped in a measuring <View>; every
  // other row renders bare. Give the wrapped rows their own recycle pool so a
  // cell is never reused across the wrapped/bare boundary — otherwise FlashList
  // swaps the root element type on recycle and React remounts the whole row
  // (and re-fires its onLayout), which is the jank when scrolling the oldest
  // section into view.
  const getItemType = useCallback(
    (item: ActivityRow) => (lastSectionRowIds?.has(item.id) ? `${item.kind}-tail` : item.kind),
    [lastSectionRowIds],
  );

  const renderRow = useCallback(
    (item: ActivityRow) => {
      let content: React.ReactNode;
      if (item.kind === 'header') {
        const allSelected =
          item.transactionIds.length > 0 &&
          item.transactionIds.every((id) => selectedTransactionIdSet.has(id));
        content = (
          <DayHeaderRow
            dateLabel={item.dateLabel}
            weekdayLabel={item.weekdayLabel}
            incomeSubtotal={item.incomeSubtotal}
            expenseSubtotal={item.expenseSubtotal}
            isTimeMode={isTimeMode}
            settings={subtotalSettings}
            selectionMode={selectionMode}
            allSelected={allSelected}
            transactionIds={item.transactionIds}
            onToggleSelectAll={onToggleDaySelection}
          />
        );
      } else {
        content = (
          <TransactionItem
            transaction={item.transaction}
            onPressTransaction={onTransactionPress}
            onLongPressTransaction={onTransactionLongPress}
            onPressSplitBadge={onTransactionSplitBadgePress}
            selected={selectedTransactionIdSet.has(item.transaction.id)}
            selectionMode={selectionMode}
            highlighted={highlightedId === item.transaction.id}
            disableAnimations={disableItemAnimations}
            compact={compactItems}
            showDateInSubtitle={!groupByDate}
            settings={displaySettings}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
          />
        );
      }

      // Measure the oldest (trailing) section's rows so the spacer below the
      // list can be sized to just fill one page under its header.
      if (lastSectionRowIds?.has(item.id)) {
        return (
          <View onLayout={(event) => measureSectionRow(item.id, event.nativeEvent.layout.height)}>
            {content}
          </View>
        );
      }
      return content;
    },
    [
      disableItemAnimations,
      compactItems,
      getTrueHourlyRateForDate,
      groupByDate,
      highlightedId,
      isTimeMode,
      lastSectionRowIds,
      measureSectionRow,
      onTransactionPress,
      onTransactionLongPress,
      onTransactionSplitBadgePress,
      onToggleDaySelection,
      selectedTransactionIdSet,
      selectionMode,
      displaySettings,
      subtotalSettings,
    ],
  );
  const renderListItem = useCallback(
    ({ item }: { item: ActivityRow }) => renderRow(item),
    [renderRow],
  );
  const listHeader = useMemo(
    () => (listHeaderComponent ? <>{listHeaderComponent}</> : null),
    [listHeaderComponent],
  );
  const listEmpty = useMemo(
    () => (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        mascotMood="curious"
        animateIn={!disableItemAnimations}
      />
    ),
    [disableItemAnimations, emptyMessage, emptyTitle],
  );

  useEffect(() => {
    if (!scrollToTopRef) return;
    scrollToTopRef.current = () => {
      if (disableVirtualization) {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    };
    return () => {
      scrollToTopRef.current = null;
    };
  }, [disableVirtualization, scrollToTopRef]);

  // The handler and its re-snap timers live on refs (rowsRef /
  // lastHeaderIndexRef / lastSectionSpacerRef) rather than effect closures, so
  // they survive rows-identity churn — the post-create DB reconciliation swaps
  // the new row's object within ~300ms, which would otherwise re-run the effect
  // and cancel the corrective re-snaps mid-flight.
  const snapTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearSnapTimers = useCallback(() => {
    snapTimersRef.current.forEach(clearTimeout);
    snapTimersRef.current = [];
  }, []);

  const scrollToDay = useCallback(
    (dayKey: string) => {
      clearSnapTimers();
      const headerId = `header-${dayKey}`;
      const findHeaderIndex = () =>
        rowsRef.current.findIndex((row) => row.kind === 'header' && row.id === headerId);
      const index = findHeaderIndex();
      if (index < 0) {
        // The day has no transactions in this month — fall back to the top.
        flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
        return;
      }
      if (index === lastHeaderIndexRef.current) {
        // Oldest day: it sorts to the bottom of the list. When it fits within the
        // viewport the trailing spacer is sized so the list END lands its header
        // exactly at the top — scrollToEnd hits that deterministically (a plain
        // scrollToIndex to this far, size-estimated row undershoots and stops
        // short). When the section is taller than the viewport there's no spacer,
        // so scrollToEnd would overshoot and push the header off the top; there
        // scrollToIndex reaches the top using the section's own rows below it.
        // Re-issue a few times as the rows measure and the offset settles.
        const jumpToOldest = () => {
          // Re-resolve on every attempt: rows can be replaced between retries,
          // shifting the header's index or its oldest-day status.
          const liveIndex = findHeaderIndex();
          if (liveIndex < 0) return;
          if (liveIndex === lastHeaderIndexRef.current && lastSectionSpacerRef.current > 0) {
            flashListRef.current?.scrollToEnd({ animated: false });
          } else {
            flashListRef.current?.scrollToIndex({
              index: liveIndex,
              animated: false,
              viewOffset: 0,
            });
          }
        };
        jumpToOldest();
        snapTimersRef.current = [80, 200, 400].map((delay) => setTimeout(jumpToOldest, delay));
        return;
      }
      flashListRef.current?.scrollToIndex({ index, animated: true, viewOffset: 0 });
    },
    [clearSnapTimers],
  );

  useEffect(() => {
    if (!scrollToDayRef) return;
    scrollToDayRef.current = scrollToDay;
    return () => {
      scrollToDayRef.current = null;
      clearSnapTimers();
    };
  }, [clearSnapTimers, scrollToDay, scrollToDayRef]);

  // Bundle the row-state inputs FlashList must re-render on (selection + the
  // post-create highlight) so a highlight change actually repaints the rows.
  const listExtraData = useMemo(
    () => ({ selectedTransactionIds, highlightedId }),
    [selectedTransactionIds, highlightedId],
  );

  if (disableVirtualization) {
    return (
      <ScrollView
        ref={scrollViewRef}
        bounces={!disableScrollBounce}
        overScrollMode={disableScrollBounce ? 'never' : 'auto'}
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        contentContainerStyle={contentContainerStyle}
        {...navScrollProps}
      >
        {listHeader}
        {rows.length === 0
          ? listEmpty
          : rows.map((item) => <React.Fragment key={item.id}>{renderRow(item)}</React.Fragment>)}
      </ScrollView>
    );
  }

  return (
    <FlashList
      ref={flashListRef}
      key={listKey}
      data={rows}
      extraData={listExtraData}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      drawDistance={420}
      maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_DISABLED}
      removeClippedSubviews
      bounces={!disableScrollBounce}
      overScrollMode={disableScrollBounce ? 'never' : 'auto'}
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      contentContainerStyle={contentContainerStyle}
      onLayout={fillLastSectionToViewport ? handleListLayout : undefined}
      renderItem={renderListItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      {...navScrollProps}
    />
  );
});
