import React, { memo, useCallback, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import type { CalendarDayAggregate } from '../lib/calendarBuild';
import { dayKeyToUtcDate, shiftDayKey, weekDayKeys } from '../lib/calendarBuild';

const TOTAL_WEEK_SLOTS = 521;
const CENTER_WEEK_INDEX = 260;

interface CalendarWeekStripProps {
  selectedDayKey: string;
  todayDayKey: string;
  weekdayLabels: string[];
  anchorWeekStart: string;
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  onSelectDay: (dayKey: string) => void;
  onWeekChange?: (weekStartKey: string) => void;
  onListRef?: (ref: FlatList<number> | null) => void;
}

interface WeekPageProps {
  pageWidth: number;
  weekStartKey: string;
  selectedDayKey: string;
  todayDayKey: string;
  weekdayLabels: string[];
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  onSelectDay: (dayKey: string) => void;
}

const WeekPage = memo(function WeekPage({
  pageWidth,
  weekStartKey,
  selectedDayKey,
  todayDayKey,
  weekdayLabels,
  dailyByDayKey,
  onSelectDay,
}: WeekPageProps) {
  const themeColors = useThemeColors();
  const days = useMemo(() => weekDayKeys(weekStartKey), [weekStartKey]);
  const cellWidth = Math.floor((pageWidth - 40) / 7);

  return (
    <View style={[styles.weekPage, { width: pageWidth }]}>
      <View style={styles.weekRow}>
        {days.map((dayKey, i) => {
          const isSelected = dayKey === selectedDayKey;
          const isToday = dayKey === todayDayKey;
          const agg = dailyByDayKey.get(dayKey);
          const hasActivity = agg != null && agg.transactionCount > 0;
          const dateObj = dayKeyToUtcDate(dayKey);
          const dayNumber = dateObj ? dateObj.getUTCDate() : 0;

          return (
            <Pressable
              key={dayKey}
              onPress={() => {
                void triggerHaptic('selection');
                onSelectDay(dayKey);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[styles.dayColumn, { width: cellWidth }]}
            >
              <Text variant="label" tone="muted" style={styles.weekdayLabelText}>
                {weekdayLabels[i]}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  isSelected && { backgroundColor: themeColors.primary },
                  isToday && !isSelected && {
                    borderWidth: 2,
                    borderColor: themeColors.primary,
                  },
                ]}
              >
                <Text
                  variant="bodyStrong"
                  style={[
                    styles.dayNumberText,
                    isSelected && { color: '#fff' },
                    isToday && !isSelected && { color: themeColors.primary },
                  ]}
                >
                  {dayNumber}
                </Text>
              </View>
              {hasActivity ? (
                <View
                  style={[
                    styles.activityDot,
                    {
                      backgroundColor: isSelected
                        ? themeColors.primary
                        : themeColors.textMuted,
                    },
                  ]}
                />
              ) : (
                <View style={styles.activityDotSpacer} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

export const CalendarWeekStrip = memo(function CalendarWeekStrip({
  selectedDayKey,
  todayDayKey,
  weekdayLabels,
  anchorWeekStart,
  dailyByDayKey,
  onSelectDay,
  onWeekChange,
  onListRef,
}: CalendarWeekStripProps) {
  const { width: screenWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<number> | null>(null);
  const activeIndexRef = useRef(CENTER_WEEK_INDEX);

  const setListRef = useCallback(
    (ref: FlatList<number> | null) => {
      listRef.current = ref;
      onListRef?.(ref);
    },
    [onListRef],
  );

  const slots = useMemo(
    () => Array.from({ length: TOTAL_WEEK_SLOTS }, (_, i) => i),
    [],
  );

  const getWeekStartForIndex = useCallback(
    (index: number) => {
      const offset = (index - CENTER_WEEK_INDEX) * 7;
      return shiftDayKey(anchorWeekStart, offset);
    },
    [anchorWeekStart],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth],
  );

  const keyExtractor = useCallback((item: number) => String(item), []);

  const handleMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        void triggerHaptic('selection');
        const ws = getWeekStartForIndex(idx);
        onWeekChange?.(ws);
      }
    },
    [screenWidth, getWeekStartForIndex, onWeekChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const ws = getWeekStartForIndex(item);
      return (
        <WeekPage
          pageWidth={screenWidth}
          weekStartKey={ws}
          selectedDayKey={selectedDayKey}
          todayDayKey={todayDayKey}
          weekdayLabels={weekdayLabels}
          dailyByDayKey={dailyByDayKey}
          onSelectDay={onSelectDay}
        />
      );
    },
    [
      screenWidth,
      selectedDayKey,
      todayDayKey,
      weekdayLabels,
      dailyByDayKey,
      onSelectDay,
      getWeekStartForIndex,
    ],
  );

  return (
    <FlatList
      ref={setListRef}
      data={slots}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      bounces={false}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      renderItem={renderItem}
      extraData={selectedDayKey}
      initialScrollIndex={CENTER_WEEK_INDEX}
      onMomentumScrollEnd={handleMomentumEnd}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews
      style={styles.list}
    />
  );
});

export { CENTER_WEEK_INDEX };

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
  },
  weekPage: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  dayColumn: {
    alignItems: 'center',
    gap: 4,
  },
  weekdayLabelText: {
    textAlign: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    textAlign: 'center',
  },
  activityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.6,
  },
  activityDotSpacer: {
    width: 5,
    height: 5,
  },
});
