import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  View,
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
const CALENDAR_SWIPE_COMMIT_DISTANCE = 18;
const CALENDAR_SWIPE_START = 8;
const CALENDAR_SWIPE_VELOCITY_THRESHOLD = 0.22;
const CALENDAR_SWIPE_MIN_FLING_DISTANCE = 8;
const CALENDAR_SWIPE_INTENT_RATIO = 1.4;
const CALENDAR_SWIPE_MAX_VERTICAL_DRIFT = 22;

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
  const isCalendarSwipeAnimatingRef = useRef(false);

  const recentDays = useMemo(getRecentDays, []);
  const currentMonthCells = useMemo(() => monthGrid(calendarMonth), [calendarMonth]);

  const shiftCalendarMonth = useCallback((direction: -1 | 1, withHaptic = true) => {
    if (withHaptic) {
      void triggerHaptic('selection');
    }
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  }, []);

  const isHorizontalSwipeIntent = useCallback((dx: number, dy: number) => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    return (
      absDx > CALENDAR_SWIPE_START &&
      absDx > absDy * CALENDAR_SWIPE_INTENT_RATIO &&
      absDy < CALENDAR_SWIPE_MAX_VERTICAL_DRIFT
    );
  }, []);

  const completeCalendarSwipe = useCallback(
    (direction: -1 | 1) => {
      if (isCalendarSwipeAnimatingRef.current) return;
      isCalendarSwipeAnimatingRef.current = true;
      shiftCalendarMonth(direction);
      requestAnimationFrame(() => {
        isCalendarSwipeAnimatingRef.current = false;
      });
    },
    [shiftCalendarMonth],
  );

  const calendarPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !isCalendarSwipeAnimatingRef.current &&
          isHorizontalSwipeIntent(gestureState.dx, gestureState.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gestureState) => {
          if (isCalendarSwipeAnimatingRef.current) return;
          const canUseVelocityCommit =
            Math.abs(gestureState.dx) >= CALENDAR_SWIPE_MIN_FLING_DISTANCE;
          if (
            gestureState.dx <= -CALENDAR_SWIPE_COMMIT_DISTANCE ||
            (canUseVelocityCommit && gestureState.vx <= -CALENDAR_SWIPE_VELOCITY_THRESHOLD)
          ) {
            completeCalendarSwipe(1);
            return;
          }
          if (
            gestureState.dx >= CALENDAR_SWIPE_COMMIT_DISTANCE ||
            (canUseVelocityCommit && gestureState.vx >= CALENDAR_SWIPE_VELOCITY_THRESHOLD)
          ) {
            completeCalendarSwipe(-1);
          }
        },
        onPanResponderTerminate: () => {},
        onShouldBlockNativeResponder: () => false,
      }),
    [completeCalendarSwipe, isHorizontalSwipeIntent],
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
  const renderCalendarPage = useCallback(
    (
      cells: {
        iso: string;
        day: number;
        inMonth: boolean;
      }[],
      pageKey: string,
    ) => (
      <View key={pageKey} className="flex-row flex-wrap justify-between gap-y-1.5">
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
    [onSelect, value],
  );

  return (
    <View className="flex-1 px-4 pt-2 pb-4">
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
      <View className="overflow-hidden" {...calendarPanResponder.panHandlers}>
        {renderCalendarPage(currentMonthCells, 'current')}
      </View>
    </View>
  );
}
