import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import type { WeekStartsOn } from '~/types';

import type { CalendarDayAggregate } from '../lib/calendarBuild';
import { weekdayColumnIndex } from '../lib/calendarBuild';
import {
  getCalendarYearLayout,
  YEAR_DAY_ROWS,
  YEAR_HEADER_HEIGHT,
  YEAR_HORIZONTAL_PADDING,
  YEAR_MONTH_HORIZONTAL_GAP,
  YEAR_MONTH_NAME_HEIGHT,
  YEAR_ROW_VERTICAL_GAP,
} from '../lib/calendarZoom';

export const TOTAL_YEAR_SLOTS = 21;
export const CENTER_YEAR_INDEX = 10;

interface CalendarYearViewProps {
  centerYear: number;
  todayDayKey: string;
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  onSelectMonth: (year: number, monthIndex: number) => void;
  onListRef?: (ref: FlatList<number> | null) => void;
}

interface MiniMonthProps {
  year: number;
  monthIndex: number;
  monthWidth: number;
  cellSize: number;
  todayDayKey: string;
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  onSelectMonth: (year: number, monthIndex: number) => void;
}

const MiniMonth = memo(function MiniMonth({
  year,
  monthIndex,
  monthWidth,
  cellSize,
  todayDayKey,
  dailyByDayKey,
  weekStartsOn,
  locale,
  onSelectMonth,
}: MiniMonthProps) {
  const handlePress = useCallback(
    () => onSelectMonth(year, monthIndex),
    [onSelectMonth, year, monthIndex],
  );
  const themeColors = useThemeColors();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayKey = `${monthKey}-01`;
  const leading = weekdayColumnIndex(firstDayKey, weekStartsOn);

  const monthName = useMemo(() => {
    const date = new Date(Date.UTC(year, monthIndex, 1));
    return date.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  }, [year, monthIndex, locale]);

  const cells: (number | null)[] = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length < 42) arr.push(null);
    return arr;
  }, [leading, daysInMonth]);

  const fontSize = Math.max(8, cellSize - 7);

  return (
    <Pressable
      onPress={handlePress}
      style={{ width: monthWidth }}
      accessibilityRole="button"
      accessibilityLabel={monthName}
      className="active:opacity-70"
    >
      <Text style={[styles.monthName, { color: themeColors.text }]} numberOfLines={1}>
        {monthName}
      </Text>
      {Array.from({ length: YEAR_DAY_ROWS }, (_, row) => (
        <View key={row} style={styles.miniRow}>
          {cells.slice(row * 7, (row + 1) * 7).map((day, col) => {
            if (day == null) {
              return <View key={col} style={{ width: cellSize, height: cellSize }} />;
            }
            const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
            const isToday = dayKey === todayDayKey;
            const hasActivity = dailyByDayKey.has(dayKey);
            return (
              <View key={col} style={[styles.miniCell, { width: cellSize, height: cellSize }]}>
                {isToday ? (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        borderRadius: cellSize / 2,
                        backgroundColor: themeColors.primary,
                      },
                    ]}
                  />
                ) : null}
                <Text
                  style={[
                    styles.miniDayText,
                    {
                      color: isToday
                        ? '#fff'
                        : hasActivity
                          ? themeColors.primary
                          : themeColors.textMuted,
                      fontSize,
                      lineHeight: fontSize + 2,
                      fontWeight: isToday || hasActivity ? '600' : '400',
                    },
                  ]}
                >
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </Pressable>
  );
});

interface YearPageProps {
  year: number;
  monthWidth: number;
  cellSize: number;
  todayDayKey: string;
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  onSelectMonth: (year: number, monthIndex: number) => void;
}

const YearPage = memo(function YearPage({
  year,
  monthWidth,
  cellSize,
  todayDayKey,
  dailyByDayKey,
  weekStartsOn,
  locale,
  onSelectMonth,
}: YearPageProps) {
  const themeColors = useThemeColors();
  return (
    <View style={styles.yearItem}>
      <Text style={[styles.yearHeader, { color: themeColors.text }]}>{year}</Text>
      {Array.from({ length: 4 }, (_, row) => (
        <View
          key={row}
          style={[
            styles.monthRow,
            {
              gap: YEAR_MONTH_HORIZONTAL_GAP,
              marginBottom: row < 3 ? YEAR_ROW_VERTICAL_GAP : 0,
            },
          ]}
        >
          {Array.from({ length: 3 }, (__, col) => {
            const mi = row * 3 + col;
            return (
              <MiniMonth
                key={mi}
                year={year}
                monthIndex={mi}
                monthWidth={monthWidth}
                cellSize={cellSize}
                todayDayKey={todayDayKey}
                dailyByDayKey={dailyByDayKey}
                weekStartsOn={weekStartsOn}
                locale={locale}
                onSelectMonth={onSelectMonth}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
});

export const CalendarYearView = memo(function CalendarYearView({
  centerYear,
  todayDayKey,
  dailyByDayKey,
  weekStartsOn,
  locale,
  onSelectMonth,
  onListRef,
}: CalendarYearViewProps) {
  const { width: screenWidth } = useWindowDimensions();

  const { monthWidth, cellSize, yearItemHeight } = getCalendarYearLayout(screenWidth);

  const slots = useMemo(() => Array.from({ length: TOTAL_YEAR_SLOTS }, (_, i) => i), []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: yearItemHeight,
      offset: yearItemHeight * index,
      index,
    }),
    [yearItemHeight],
  );

  const keyExtractor = useCallback((item: number) => `year-${item}`, []);

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const year = centerYear + (item - CENTER_YEAR_INDEX);
      return (
        <YearPage
          year={year}
          monthWidth={monthWidth}
          cellSize={cellSize}
          todayDayKey={todayDayKey}
          dailyByDayKey={dailyByDayKey}
          weekStartsOn={weekStartsOn}
          locale={locale}
          onSelectMonth={onSelectMonth}
        />
      );
    },
    [
      centerYear,
      monthWidth,
      cellSize,
      todayDayKey,
      dailyByDayKey,
      weekStartsOn,
      locale,
      onSelectMonth,
    ],
  );

  return (
    <FlatList
      ref={onListRef}
      data={slots}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      renderItem={renderItem}
      initialScrollIndex={CENTER_YEAR_INDEX}
      showsVerticalScrollIndicator={false}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews
    />
  );
});

const styles = StyleSheet.create({
  yearItem: {
    paddingHorizontal: YEAR_HORIZONTAL_PADDING,
    paddingBottom: 16,
  },
  yearHeader: {
    fontSize: 28,
    fontWeight: '700',
    height: YEAR_HEADER_HEIGHT,
    lineHeight: YEAR_HEADER_HEIGHT,
  },
  monthRow: {
    flexDirection: 'row',
  },
  monthName: {
    fontSize: 13,
    fontWeight: '600',
    height: YEAR_MONTH_NAME_HEIGHT,
    lineHeight: YEAR_MONTH_NAME_HEIGHT,
  },
  miniRow: {
    flexDirection: 'row',
  },
  miniCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniDayText: {
    textAlign: 'center',
  },
});
