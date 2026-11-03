import type React from 'react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { FlatList } from 'react-native';

import { yearMonthFromKey, yearMonthToKey } from '~/components/datePicker/monthJump';
import { useMonthPager } from '~/hooks/useMonthPager';

/** Whether the pager is on its first or last month, for the header's arrows. */
export interface MonthPagerEdges {
  atStart: boolean;
  atEnd: boolean;
}

/** What an Insights month page (Budget, Household) gives the header above it. */
export interface MonthPagerHandle {
  scrollToRelative: (direction: 1 | -1) => void;
  /** Open the month wheel, for the host header's month label. */
  openMonthPicker: () => void;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * A horizontal pager over month keys ('YYYY-MM', oldest first), the parts the
 * Budget and Household pages share on top of `useMonthPager`:
 *
 * - `months` stays the same array while its keys do, so an edit that does not
 *   move the pager's ends does not rebuild every page;
 * - when months are added or removed at the front (a backdated entry, an
 *   import, a delete) the pager stays on the month being viewed, or the
 *   nearest later one if that month went, not on the same slot;
 * - the header's handle (arrows, month wheel) and the month wheel's props.
 *
 * `initialIndex` is read on the first render only.
 */
export function useMonthKeyPager({
  months: nextMonths,
  pageWidth,
  initialIndex,
  ref,
  onEdgesChange,
}: {
  months: readonly string[];
  pageWidth: number;
  initialIndex: number;
  ref: React.Ref<MonthPagerHandle>;
  /** Told whenever the pager reaches or leaves its first or last month. */
  onEdgesChange?: (edges: MonthPagerEdges) => void;
}) {
  const monthsRef = useRef(nextMonths);
  const months = useMemo(() => {
    if (sameKeys(monthsRef.current, nextMonths)) return monthsRef.current;
    monthsRef.current = nextMonths;
    return nextMonths;
  }, [nextMonths]);

  const listRef = useRef<FlatList<number>>(null);
  const pager = useMonthPager({ listRef, pageWidth, totalSlots: months.length, initialIndex });
  const { activeIndexRef, setActiveIndex, jumpToIndex, scrollToRelative } = pager;

  // After the list has taken the new length (a layout effect could scroll
  // before it has, and Android caps the offset at the old width).
  const previousMonthsRef = useRef(months);
  useEffect(() => {
    const previousMonths = previousMonthsRef.current;
    if (previousMonths === months) return;
    previousMonthsRef.current = months;
    const viewed = previousMonths[activeIndexRef.current];
    if (!viewed) return;
    let nextIndex = months.indexOf(viewed);
    if (nextIndex < 0) {
      const nearest = months.findIndex((month) => month >= viewed);
      nextIndex = nearest >= 0 ? nearest : months.length - 1;
    }
    if (nextIndex === activeIndexRef.current) return;
    setActiveIndex(nextIndex);
    listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
  }, [activeIndexRef, months, pageWidth, setActiveIndex]);

  /** Opens `monthKey`, or the first month after it the pager has, else the last. */
  const jumpToMonth = useCallback(
    (monthKey: string) => {
      const exact = months.indexOf(monthKey);
      const next = exact >= 0 ? exact : months.findIndex((month) => month >= monthKey);
      jumpToIndex(next >= 0 ? next : months.length - 1);
    },
    [jumpToIndex, months],
  );

  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  useImperativeHandle(
    ref,
    () => ({ scrollToRelative, openMonthPicker: () => setIsMonthPickerOpen(true) }),
    [scrollToRelative],
  );

  const atStart = pager.activeIndex <= 0;
  const atEnd = pager.activeIndex >= months.length - 1;
  useEffect(() => {
    onEdgesChange?.({ atStart, atEnd });
  }, [atEnd, atStart, onEdgesChange]);

  const activeMonth = months[pager.activeIndex] ?? months[months.length - 1]!;
  const activeYearMonth = yearMonthFromKey(activeMonth);
  /** Spread onto `MonthYearWheelPicker` (with `locale`): it stops at the pager's ends. */
  const monthWheel = {
    visible: isMonthPickerOpen,
    year: activeYearMonth.year,
    monthIndex: activeYearMonth.monthIndex,
    min: yearMonthFromKey(months[0]!),
    max: yearMonthFromKey(months[months.length - 1]!),
    onSelect: (year: number, monthIndex: number) => {
      setIsMonthPickerOpen(false);
      jumpToMonth(yearMonthToKey({ year, monthIndex }));
    },
    onClose: () => setIsMonthPickerOpen(false),
  };

  return { months, listRef, pager, activeMonth, jumpToMonth, monthWheel };
}
