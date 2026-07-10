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

// The grouped list renders ONE cell per day (header + that day's transactions),
// not a flat stream of header/item rows. Days are the unit users navigate by,
// so scroll-to-day targets a real cell — and with at most ~31 cells per month,
// FlashList's estimate-then-converge scrollToIndex lands reliably. The trailing
// spacer that lets the oldest day reach the top of the viewport is also a real
// row (kind 'spacer'), NOT contentContainer padding: FlashList clamps
// scrollToIndex targets to its own layout size, which excludes container
// padding, so a padding spacer made every near-bottom day stop short of the
// top (the "June 2 doesn't scroll while June 1 does" bug).
type ActivityRow =
  | {
      kind: 'day';
      id: string;
      dayKey: string;
      dateLabel: string;
      weekdayLabel: string;
      incomeSubtotal: number;
      expenseSubtotal: number;
      transactionIds: string[];
      transactions: TransactionWithRelations[];
    }
  | { kind: 'item'; id: string; transaction: TransactionWithRelations }
  | { kind: 'spacer'; id: 'trailing-spacer' };

type DayRow = Extract<ActivityRow, { kind: 'day' }>;

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
   * When set (grouped monthly list, newest-first), a trailing spacer row is
   * appended and sized so the oldest day's cell — which sorts to the bottom —
   * can be scrolled up until its header sits at the top of the viewport,
   * filling one page. Only useful for pagers that scroll to days (the calendar
   * home list); leave off elsewhere to skip the measuring and the blank.
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

    // Input is date-sorted, so each day's transactions arrive contiguously;
    // grouping by key (rather than boundary detection) also tolerates stray
    // non-contiguous duplicates by merging them into the first occurrence.
    const dayRowsByKey = new Map<string, DayRow>();
    const nextRows: ActivityRow[] = [];

    transactions.forEach((transaction) => {
      const dayKey = dayKeyFromIso(transaction.date);
      let dayRow = dayRowsByKey.get(dayKey);
      if (!dayRow) {
        const { dateLabel, weekdayLabel } = formatDayHeaderParts(dayKey, locale);
        dayRow = {
          kind: 'day',
          id: `day-${dayKey}`,
          dayKey,
          dateLabel,
          weekdayLabel,
          incomeSubtotal: 0,
          expenseSubtotal: 0,
          transactionIds: [],
          transactions: [],
        };
        dayRowsByKey.set(dayKey, dayRow);
        nextRows.push(dayRow);
      }
      if (transaction.type === 'income' || transaction.type === 'expense') {
        const value = isTimeMode
          ? getDisplayValueForTransaction(transaction)
          : subtotalCurrencyCode
            ? (transaction.accountAmount ?? transaction.amount)
            : (transaction.reportingAmount ?? transaction.amount);
        if (transaction.type === 'income') {
          dayRow.incomeSubtotal += value;
        } else {
          dayRow.expenseSubtotal += value;
        }
      }
      dayRow.transactionIds.push(transaction.id);
      dayRow.transactions.push(transaction);
    });

    // The trailing spacer is a real row so FlashList's scroll math includes it
    // (see the ActivityRow comment) — appended only when the oldest day must be
    // able to reach the top of the viewport.
    if (fillLastSectionToViewport && nextRows.length > 0) {
      nextRows.push({ kind: 'spacer', id: 'trailing-spacer' });
    }

    return nextRows;
  }, [
    fillLastSectionToViewport,
    getDisplayValueForTransaction,
    groupByDate,
    isTimeMode,
    locale,
    subtotalCurrencyCode,
    transactions,
  ]);

  // Render-synced ref so long-lived imperative handlers (scroll-to-day, the
  // highlight subscription) always read the latest rows without re-creating
  // themselves on every data change.
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
    const present = liveRows.some((row) =>
      row.kind === 'day'
        ? row.transactionIds.includes(pending.id)
        : row.kind === 'item' && row.id === pending.id,
    );
    if (!present) return;
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

  // --- Trailing spacer sizing ---
  // The spacer row is sized to `viewport - lastDayCellHeight` so the oldest
  // day's header can land exactly at the top of the viewport, clamped to no
  // less than the base bottom padding so content never ends flush against the
  // bottom nav. Only the last day cell's height is needed; its measurement is
  // keyed by dayKey so a stale value from a previous trailing day is ignored
  // automatically when the section membership changes.
  const hasTrailingSpacer = rows.length > 0 && rows[rows.length - 1].kind === 'spacer';
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    setListViewportHeight(event.nativeEvent.layout.height);
  }, []);

  const lastDayKey = useMemo(() => {
    if (!hasTrailingSpacer) return null;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (row.kind === 'day') return row.dayKey;
    }
    return null;
  }, [hasTrailingSpacer, rows]);
  const lastDayKeyRef = useRef(lastDayKey);
  lastDayKeyRef.current = lastDayKey;

  const [lastDayMeasure, setLastDayMeasure] = useState<{ dayKey: string; height: number } | null>(
    null,
  );
  const measureDayCell = useCallback((dayKey: string, height: number) => {
    if (dayKey !== lastDayKeyRef.current) return;
    // Round to whole pixels so sub-pixel layout jitter doesn't churn state
    // (and the spacer) frame after frame.
    const rounded = Math.round(height);
    setLastDayMeasure((prev) =>
      prev && prev.dayKey === dayKey && prev.height === rounded
        ? prev
        : { dayKey, height: rounded },
    );
  }, []);

  const baseBottomPadding = contentPaddingBottom + (extendUnderBottomNav ? bottomNavInset : 0);
  const lastDayHeight =
    lastDayMeasure && lastDayMeasure.dayKey === lastDayKey ? lastDayMeasure.height : 0;
  // Until the last cell measures, lastDayHeight is 0 and the spacer spans a
  // full viewport (generous); it settles to the exact size one layout later.
  const trailingSpacerHeight = hasTrailingSpacer
    ? Math.max(baseBottomPadding, listViewportHeight - lastDayHeight)
    : 0;

  const contentContainerStyle = useMemo(
    () => ({
      // The spacer row already carries at least the base bottom padding; adding
      // container padding on top would push scrollToIndex targets beyond
      // FlashList's clamped max offset (it ignores container padding).
      paddingBottom: hasTrailingSpacer ? 0 : baseBottomPadding,
      paddingHorizontal: contentPaddingHorizontal,
      paddingTop: contentPaddingTop,
    }),
    [baseBottomPadding, contentPaddingHorizontal, contentPaddingTop, hasTrailingSpacer],
  );

  const keyExtractor = useCallback((item: ActivityRow) => item.id, []);
  const getItemType = useCallback((item: ActivityRow) => item.kind, []);

  const renderRow = useCallback(
    (item: ActivityRow) => {
      if (item.kind === 'spacer') {
        return <View style={{ height: trailingSpacerHeight }} />;
      }
      if (item.kind === 'day') {
        const allSelected =
          item.transactionIds.length > 0 &&
          item.transactionIds.every((id) => selectedTransactionIdSet.has(id));
        return (
          <View
            // Attached to every day cell (the handler ignores all but the
            // trailing day) so prop shape is uniform across recycled cells and
            // a cell recycled INTO the trailing slot still reports its height.
            onLayout={
              fillLastSectionToViewport
                ? (event) => measureDayCell(item.dayKey, event.nativeEvent.layout.height)
                : undefined
            }
          >
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
            {item.transactions.map((tx, txIndex) => (
              <TransactionItem
                // Positional keys keep recycled cells cheap (a reused cell
                // updates row props in place instead of remounting each row);
                // stable ids are only needed when exit/layout animations run.
                key={disableItemAnimations ? txIndex : tx.id}
                transaction={tx}
                onPressTransaction={onTransactionPress}
                onLongPressTransaction={onTransactionLongPress}
                onPressSplitBadge={onTransactionSplitBadgePress}
                selected={selectedTransactionIdSet.has(tx.id)}
                selectionMode={selectionMode}
                highlighted={highlightedId === tx.id}
                disableAnimations={disableItemAnimations}
                compact={compactItems}
                showDateInSubtitle={false}
                settings={displaySettings}
                getTrueHourlyRateForDate={getTrueHourlyRateForDate}
              />
            ))}
          </View>
        );
      }
      return (
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
          showDateInSubtitle
          settings={displaySettings}
          getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        />
      );
    },
    [
      compactItems,
      disableItemAnimations,
      displaySettings,
      fillLastSectionToViewport,
      getTrueHourlyRateForDate,
      highlightedId,
      isTimeMode,
      measureDayCell,
      onToggleDaySelection,
      onTransactionLongPress,
      onTransactionPress,
      onTransactionSplitBadgePress,
      selectedTransactionIdSet,
      selectionMode,
      subtotalSettings,
      trailingSpacerHeight,
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

  // Scroll a day's cell to the top of the viewport. FlashList v2's
  // scrollToIndex converges on the target itself (it re-reads the layout as
  // cells render and restarts if the target moves), and because the trailing
  // spacer is a real row its clamped max offset is correct for every day —
  // including the oldest — so no retries or scrollToEnd special case needed.
  const scrollToDay = useCallback((dayKey: string) => {
    const rowId = `day-${dayKey}`;
    const index = rowsRef.current.findIndex((row) => row.id === rowId);
    if (index < 0) {
      // The day has no transactions in this month — fall back to the top.
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
      return;
    }
    void flashListRef.current?.scrollToIndex({ index, animated: true, viewOffset: 0 });
  }, []);

  useEffect(() => {
    if (!scrollToDayRef) return;
    scrollToDayRef.current = scrollToDay;
    return () => {
      scrollToDayRef.current = null;
    };
  }, [scrollToDay, scrollToDayRef]);

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
        onLayout={fillLastSectionToViewport ? handleListLayout : undefined}
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
