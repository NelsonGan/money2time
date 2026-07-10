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
// row (kind 'spacer'), NOT contentContainer padding and NOT a ListFooterComponent:
// FlashList clamps scrollToIndex targets to its child-container layout size,
// which excludes both container padding and the footer (rendered as a sibling
// after the item container), so either would make near-bottom days stop short of
// the top — the "June 2 doesn't scroll while June 1 does" bug. Its height rides
// in the row's own data so a resize repaints only the spacer, not every cell.
type ActivityRow =
  | {
      kind: 'day';
      id: string;
      dayKey: string;
      dateLabel: string;
      weekdayLabel: string;
      incomeSubtotal: number;
      expenseSubtotal: number;
      transactions: TransactionWithRelations[];
    }
  | { kind: 'item'; id: string; transaction: TransactionWithRelations }
  | { kind: 'spacer'; id: 'trailing-spacer'; height: number };

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
// After a scroll-to-day request, re-issue the scroll (instantly) if the trailing
// spacer settles within this window — a near-bottom day requested before the
// viewport or the oldest cell was measured otherwise lands short and, without a
// re-issue, never corrects.
const SCROLL_SETTLE_WINDOW_MS = 1200;

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
  /** The day's transactions — single source of truth. Select-all derives ids
   *  from these only on tap (no per-render id array), and the array identity is
   *  stable across renders (built once in the rows memo) so the memo holds. */
  transactions: TransactionWithRelations[];
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
  transactions,
  onToggleSelectAll,
}: DayHeaderRowProps) {
  const themeColors = useThemeColors();

  return (
    <View className="pt-2 pb-1.5 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {selectionMode ? (
          <Pressable
            onPress={() => onToggleSelectAll?.(transactions.map((tx) => tx.id))}
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

// Recycle pool key for a day cell, bucketed by transaction count so FlashList
// reuses a cell onto a similarly-sized day instead of swapping a 1-item cell
// for a 30-item one (which would mount/unmount dozens of rows in a single
// frame). Keeps the positional-key in-place update path cheap.
function dayItemType(count: number): string {
  if (count <= 1) return 'day-1';
  if (count <= 3) return 'day-3';
  if (count <= 6) return 'day-6';
  if (count <= 12) return 'day-12';
  return 'day-many';
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
      dayRow.transactions.push(transaction);
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

  // Render-synced ref so long-lived imperative handlers (scroll-to-day, the
  // highlight subscription) always read the latest rows without re-creating
  // themselves on every data change.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Promote a pending highlight to state once its row exists in the current
  // rows; the clear timer starts here, when the flash can actually be seen.
  const promotePendingHighlight = useCallback(() => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;
    if (Date.now() - pending.requestedAt > HIGHLIGHT_PENDING_TTL_MS) {
      pendingHighlightRef.current = null;
      return;
    }
    const present = rowsRef.current.some((row) =>
      row.kind === 'day'
        ? row.transactions.some((tx) => tx.id === pending.id)
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
      promotePendingHighlight();
    });
    return () => {
      unsubscribe();
      if (highlightClearTimerRef.current) {
        clearTimeout(highlightClearTimerRef.current);
        highlightClearTimerRef.current = null;
      }
    };
  }, [highlightOnCreate, promotePendingHighlight]);

  // The created row arrives via a data update — re-check on every rows change,
  // but only where a highlight can actually be pending (opted-in surfaces).
  useEffect(() => {
    if (!highlightOnCreate) return;
    promotePendingHighlight();
  }, [rows, highlightOnCreate, promotePendingHighlight]);

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
  // The spacer is sized to `viewport - oldestDayCellHeight` (clamped to at least
  // the base bottom padding) so the oldest day's header can land exactly at the
  // top of the viewport. Heights of ALL day cells are measured into a ref map;
  // when the trailing day changes (delete/filter) we adopt its already-known
  // height instead of waiting for an onLayout that a stable cell won't re-fire.
  const spacerEnabled = fillLastSectionToViewport && groupByDate;
  const hasTrailingSpacer = spacerEnabled && rows.length > 0;
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

  const dayHeightsRef = useRef(new Map<string, number>());
  const [lastDayHeight, setLastDayHeight] = useState(0);
  const syncLastDayHeight = useCallback(() => {
    const key = lastDayKeyRef.current;
    const next = key ? (dayHeightsRef.current.get(key) ?? 0) : 0;
    setLastDayHeight((prev) => (prev === next ? prev : next));
  }, []);

  const measureDayCell = useCallback(
    (dayKey: string, height: number) => {
      // Round to whole pixels so sub-pixel layout jitter doesn't churn state
      // (and the spacer) frame after frame.
      const rounded = Math.round(height);
      if (dayHeightsRef.current.get(dayKey) === rounded) return;
      dayHeightsRef.current.set(dayKey, rounded);
      // Only the trailing day drives the spacer; other days' heights are cached
      // so they're ready the instant they become the trailing day.
      if (dayKey === lastDayKeyRef.current) syncLastDayHeight();
    },
    [syncLastDayHeight],
  );

  // The trailing day (or the row set) changed: adopt the new trailing day's
  // cached height and prune heights for days no longer present so the map stays
  // bounded to the current month.
  useEffect(() => {
    if (!spacerEnabled) return;
    const present = new Set<string>();
    for (const row of rows) {
      if (row.kind === 'day') present.add(row.dayKey);
    }
    const heights = dayHeightsRef.current;
    for (const key of heights.keys()) {
      if (!present.has(key)) heights.delete(key);
    }
    syncLastDayHeight();
  }, [rows, spacerEnabled, syncLastDayHeight]);

  const baseBottomPadding = contentPaddingBottom + (extendUnderBottomNav ? bottomNavInset : 0);
  // Until the oldest cell measures, lastDayHeight is 0 and the spacer spans a
  // full viewport (generous); it settles to the exact size once measured.
  const trailingSpacerHeight = hasTrailingSpacer
    ? Math.max(baseBottomPadding, listViewportHeight - lastDayHeight)
    : 0;

  // The spacer's height rides in its own row object so a height change repaints
  // ONLY the spacer (a data diff on one item), leaving renderRow's identity —
  // and thus every other cell — untouched.
  const data = useMemo<ActivityRow[]>(() => {
    if (!hasTrailingSpacer) return rows;
    return [...rows, { kind: 'spacer', id: 'trailing-spacer', height: trailingSpacerHeight }];
  }, [hasTrailingSpacer, rows, trailingSpacerHeight]);

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
  const getItemType = useCallback(
    (item: ActivityRow) =>
      item.kind === 'day' ? dayItemType(item.transactions.length) : item.kind,
    [],
  );

  const renderRow = useCallback(
    (item: ActivityRow) => {
      if (item.kind === 'spacer') {
        return <View style={{ height: item.height }} />;
      }
      if (item.kind === 'day') {
        const allSelected =
          item.transactions.length > 0 &&
          item.transactions.every((tx) => selectedTransactionIdSet.has(tx.id));
        return (
          <View
            // Attached to every day cell (the handler caches all heights, only
            // the trailing day drives the spacer) so a cell recycled INTO the
            // trailing slot still reports its height.
            onLayout={
              spacerEnabled
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
              transactions={item.transactions}
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
      spacerEnabled,
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

  // Scroll a day's cell to the top of the viewport. FlashList v2's scrollToIndex
  // converges on the target itself (it re-reads the layout as cells render and
  // restarts if the target moves), and the trailing spacer is a real row so its
  // clamped max offset is correct for every day. The request is remembered so
  // that if the spacer settles a frame or two later (viewport / oldest-cell
  // measured after the scroll), the effect below re-issues it — no retry timers.
  const lastScrollRequestRef = useRef<{ dayKey: string; at: number } | null>(null);
  const scrollToDay = useCallback((dayKey: string) => {
    lastScrollRequestRef.current = { dayKey, at: Date.now() };
    const index = rowsRef.current.findIndex((row) => row.id === `day-${dayKey}`);
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

  // Re-issue the last scroll-to-day (instantly) when the trailing spacer settles
  // shortly after the request, so a near-bottom day requested before the
  // viewport/oldest cell were measured still lands its header at the top.
  useEffect(() => {
    const request = lastScrollRequestRef.current;
    if (!request || Date.now() - request.at > SCROLL_SETTLE_WINDOW_MS) return;
    const index = rowsRef.current.findIndex((row) => row.id === `day-${request.dayKey}`);
    if (index < 0) return;
    void flashListRef.current?.scrollToIndex({ index, animated: false, viewOffset: 0 });
  }, [trailingSpacerHeight]);

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
        onLayout={spacerEnabled ? handleListLayout : undefined}
        {...navScrollProps}
      >
        {listHeader}
        {data.length === 0
          ? listEmpty
          : data.map((item) => <React.Fragment key={item.id}>{renderRow(item)}</React.Fragment>)}
      </ScrollView>
    );
  }

  return (
    <FlashList
      ref={flashListRef}
      key={listKey}
      data={data}
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
      onLayout={spacerEnabled ? handleListLayout : undefined}
      renderItem={renderListItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      {...navScrollProps}
    />
  );
});
