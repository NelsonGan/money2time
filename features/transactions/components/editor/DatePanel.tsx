import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { I18n } from '~/lib/i18n';

const YEAR_CHIP_WIDTH = 86;
const YEAR_EDGE_BUFFER = 8;
const YEAR_EXTEND_COUNT = 24;
const CALENDAR_SWIPE_DISTANCE = 40;
const CALENDAR_SWIPE_START = 10;
const CALENDAR_SWIPE_COMMIT_RATIO = 0.22;
const CALENDAR_SWIPE_VELOCITY_THRESHOLD = 0.75;

interface DatePanelProps {
  value: string;
  onSelect: (date: string) => void;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(input: string) {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function getRecentDays() {
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: toDateInput(d),
      label:
        i === 0
          ? I18n.t('common.today')
          : i === 1
            ? I18n.t('transactions.editor.yest_short')
            : d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
    });
  }
  return days;
}

function monthGrid(anchor: Date) {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInCurrentMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const firstWeekday = firstDay.getDay();
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), -i);
    cells.push({ iso: toDateInput(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInCurrentMonth; day += 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({ iso: toDateInput(d), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const offset = cells.length - (firstWeekday + daysInCurrentMonth) + 1;
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + 1, offset);
    cells.push({ iso: toDateInput(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

function buildYearRange(centerYear: number, left = 36, right = 36) {
  return Array.from({ length: left + right + 1 }, (_, i) => centerYear - left + i);
}

export function DatePanel({ value, onSelect }: DatePanelProps) {
  const themeColors = useThemeColors();
  const parsed = parseDateInput(value);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (parsed) return new Date(parsed.year, parsed.month - 1, 1);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [yearRail, setYearRail] = useState<number[]>(() =>
    buildYearRange(calendarMonth.getFullYear()),
  );
  const [yearRailOffset, setYearRailOffset] = useState(() => {
    const idx = yearRail.findIndex((y) => y === calendarMonth.getFullYear());
    return Math.max(0, idx) * YEAR_CHIP_WIDTH;
  });
  const [calendarViewportWidth, setCalendarViewportWidth] = useState(0);
  const calendarSwipeTranslateX = useRef(new Animated.Value(0)).current;
  const isCalendarSwipeAnimatingRef = useRef(false);

  const recentDays = useMemo(getRecentDays, []);
  const previousMonth = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
    [calendarMonth],
  );
  const nextMonth = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
    [calendarMonth],
  );
  const previousMonthCells = useMemo(() => monthGrid(previousMonth), [previousMonth]);
  const currentMonthCells = useMemo(() => monthGrid(calendarMonth), [calendarMonth]);
  const nextMonthCells = useMemo(() => monthGrid(nextMonth), [nextMonth]);

  const shiftCalendarMonth = useCallback((direction: -1 | 1, withHaptic = true) => {
    if (withHaptic) {
      void triggerHaptic('selection');
    }
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  }, []);

  const resetCalendarSwipe = useCallback(() => {
    isCalendarSwipeAnimatingRef.current = true;
    Animated.spring(calendarSwipeTranslateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 26,
      bounciness: 4,
    }).start(() => {
      isCalendarSwipeAnimatingRef.current = false;
    });
  }, [calendarSwipeTranslateX]);

  const completeCalendarSwipe = useCallback(
    (direction: -1 | 1) => {
      if (calendarViewportWidth <= 0) {
        shiftCalendarMonth(direction);
        calendarSwipeTranslateX.setValue(0);
        return;
      }
      isCalendarSwipeAnimatingRef.current = true;
      const targetX = direction === 1 ? -calendarViewportWidth : calendarViewportWidth;
      Animated.timing(calendarSwipeTranslateX, {
        toValue: targetX,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        calendarSwipeTranslateX.setValue(0);
        if (!finished) {
          isCalendarSwipeAnimatingRef.current = false;
          return;
        }
        shiftCalendarMonth(direction);
        isCalendarSwipeAnimatingRef.current = false;
      });
    },
    [calendarSwipeTranslateX, calendarViewportWidth, shiftCalendarMonth],
  );

  const handleCalendarViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
      setCalendarViewportWidth((previous) => (previous === nextWidth ? previous : nextWidth));
    },
    [],
  );

  const calendarPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !isCalendarSwipeAnimatingRef.current &&
          Math.abs(gestureState.dx) > CALENDAR_SWIPE_START &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          calendarSwipeTranslateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (isCalendarSwipeAnimatingRef.current) return;
          const maxOffset = calendarViewportWidth > 0 ? calendarViewportWidth : 120;
          const clampedDx = Math.max(-maxOffset, Math.min(maxOffset, gestureState.dx));
          calendarSwipeTranslateX.setValue(clampedDx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isCalendarSwipeAnimatingRef.current) return;
          const threshold = Math.max(
            CALENDAR_SWIPE_DISTANCE,
            calendarViewportWidth * CALENDAR_SWIPE_COMMIT_RATIO,
          );
          if (
            gestureState.dx <= -threshold ||
            gestureState.vx <= -CALENDAR_SWIPE_VELOCITY_THRESHOLD
          ) {
            completeCalendarSwipe(1);
            return;
          }
          if (
            gestureState.dx >= threshold ||
            gestureState.vx >= CALENDAR_SWIPE_VELOCITY_THRESHOLD
          ) {
            completeCalendarSwipe(-1);
            return;
          }
          resetCalendarSwipe();
        },
        onPanResponderTerminate: () => {
          resetCalendarSwipe();
        },
      }),
    [calendarSwipeTranslateX, calendarViewportWidth, completeCalendarSwipe, resetCalendarSwipe],
  );

  const handleYearRailScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (yearRail.length === 0) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / YEAR_CHIP_WIDTH);
    const clampedIndex = Math.max(0, Math.min(yearRail.length - 1, index));
    const pickedYear = yearRail[clampedIndex];
    if (pickedYear) {
      setCalendarMonth((prev) => new Date(pickedYear, prev.getMonth(), 1));
    }
    if (clampedIndex < YEAR_EDGE_BUFFER) {
      const first = yearRail[0];
      const prepend = Array.from(
        { length: YEAR_EXTEND_COUNT },
        (_, i) => first - YEAR_EXTEND_COUNT + i,
      );
      setYearRail((prev) => [...prepend, ...prev]);
      setYearRailOffset(offsetX + prepend.length * YEAR_CHIP_WIDTH);
      return;
    }
    if (clampedIndex > yearRail.length - 1 - YEAR_EDGE_BUFFER) {
      const last = yearRail[yearRail.length - 1];
      const append = Array.from({ length: YEAR_EXTEND_COUNT }, (_, i) => last + i + 1);
      setYearRail((prev) => [...prev, ...append]);
    }
  };
  const calendarPageWidth = Math.max(1, calendarViewportWidth);
  const renderCalendarPage = useCallback(
    (
      cells: {
        iso: string;
        day: number;
        inMonth: boolean;
      }[],
      pageKey: string,
    ) => (
      <View
        key={pageKey}
        style={{ width: calendarPageWidth }}
        className="flex-row flex-wrap justify-between gap-y-1.5"
      >
        {cells.map((cell) => {
          const isSelected = cell.iso === value;
          return (
            <Pressable
              key={`${pageKey}-${cell.iso}`}
              onPress={() => {
                void triggerHaptic('selection');
                onSelect(cell.iso);
              }}
              className={cn(
                'w-[14%] h-[38px] rounded-xl border items-center justify-center',
                isSelected
                  ? 'bg-primary/15 border-primary/55'
                  : cell.inMonth
                    ? 'bg-card border-border/30'
                    : 'bg-secondary/40 border-border/20',
              )}
            >
              <Text
                variant="label"
                className={cn(
                  isSelected
                    ? 'text-primary'
                    : cell.inMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
                style={{ fontSize: 12 }}
              >
                {cell.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [calendarPageWidth, onSelect, value],
  );

  return (
    <ScrollView
      className="flex-1 px-4 pt-2"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      {/* Quick date chips */}
      <View className="flex-row items-center justify-between mb-3 gap-1.5">
        {recentDays.map((day) => {
          const isSelected = value === day.date;
          return (
            <Pressable
              key={day.date}
              onPress={() => {
                void triggerHaptic('selection');
                onSelect(day.date);
              }}
              className={cn(
                'flex-1 h-[48px] rounded-[14px] border items-center justify-center gap-0.5',
                isSelected ? 'bg-primary/12 border-primary/50' : 'bg-card border-border/30',
              )}
            >
              <Text
                variant="caption"
                className={cn(isSelected ? 'text-primary' : 'text-foreground')}
              >
                {day.dayNum}
              </Text>
              <Text
                variant="label"
                className={cn(isSelected ? 'text-primary' : 'text-muted-foreground')}
                style={{ fontSize: 10 }}
              >
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Month navigation */}
      <View className="flex-row items-center justify-between pb-2">
        <Pressable
          onPress={() => shiftCalendarMonth(-1)}
          className="w-8 h-8 rounded-full bg-secondary items-center justify-center"
        >
          <ChevronLeft size={14} color={themeColors.textSoft} />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Text variant="caption">
            {calendarMonth.toLocaleDateString('en-US', { month: 'long' })}
          </Text>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setShowYearPicker((prev) => !prev);
            }}
            className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10"
          >
            <Text variant="label" className="text-primary">
              {calendarMonth.getFullYear()}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => shiftCalendarMonth(1)}
          className="w-8 h-8 rounded-full bg-secondary items-center justify-center"
        >
          <ChevronRight size={14} color={themeColors.textSoft} />
        </Pressable>
      </View>

      {/* Year picker rail */}
      {showYearPicker ? (
        <View className="mb-2 rounded-2xl border border-border/35 bg-card px-2 py-2">
          <ScrollView
            horizontal
            contentOffset={{ x: yearRailOffset, y: 0 }}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleYearRailScrollEnd}
            snapToInterval={YEAR_CHIP_WIDTH}
            decelerationRate="fast"
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {yearRail.map((year) => {
              const isSelected = calendarMonth.getFullYear() === year;
              return (
                <Pressable
                  key={year}
                  onPress={() => {
                    void triggerHaptic('selection');
                    setCalendarMonth((prev) => new Date(year, prev.getMonth(), 1));
                  }}
                  className={cn(
                    'mr-2 px-3.5 py-2 rounded-full border min-w-[78px] items-center justify-center',
                    isSelected
                      ? 'bg-primary/14 border-primary/55'
                      : 'bg-background border-border/40',
                  )}
                >
                  <Text
                    variant="label"
                    className={cn(isSelected ? 'text-primary' : 'text-muted-foreground')}
                  >
                    {year}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Weekday headers */}
      <View className="flex-row justify-between pb-1.5 px-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
          <Text
            key={`wd-${idx}`}
            variant="label"
            tone="muted"
            className="w-[14%] text-center"
            style={{ fontSize: 10 }}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View
        onLayout={handleCalendarViewportLayout}
        className="overflow-hidden"
        {...calendarPanResponder.panHandlers}
      >
        <Animated.View
          className="flex-row"
          style={{
            width: calendarPageWidth * 3,
            transform: [{ translateX: -calendarPageWidth }, { translateX: calendarSwipeTranslateX }],
          }}
        >
          {renderCalendarPage(previousMonthCells, 'prev')}
          {renderCalendarPage(currentMonthCells, 'current')}
          {renderCalendarPage(nextMonthCells, 'next')}
        </Animated.View>
      </View>
    </ScrollView>
  );
}
