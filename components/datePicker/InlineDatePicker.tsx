import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { WeekStartsOn } from '~/types';
import { cn } from '~/utils';
import { dayKeyFromDateLocal } from '~/utils/formatters';

import { MonthYearWheelPicker } from './MonthYearWheelPicker';

interface InlineDatePickerProps {
  value: string;
  onSelect: (date: string) => void;
  showQuickDays?: boolean;
}

const DAY_CELL_SIZE = 36;
const DAY_HIGHLIGHT_SIZE = 32;
const QUICK_PILL_WIDTH = 62;
const QUICK_PILL_GAP = 8;
const QUICK_DAYS_BEFORE = 3;
const QUICK_DAYS_AFTER = 3;
const QUICK_TODAY_INDEX = QUICK_DAYS_BEFORE;
const SWIPE_COMMIT_RATIO = 0.22;
const SWIPE_VELOCITY_COMMIT = 500;
const SWIPE_ANIM_DURATION = 200;
const CHEVRON_ANIM_DURATION = 220;

const styles = StyleSheet.create({
  dayCell: {
    flex: 1,
    height: DAY_CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
  },
  dayHighlight: {
    width: DAY_HIGHLIGHT_SIZE,
    height: DAY_HIGHLIGHT_SIZE,
    borderRadius: DAY_HIGHLIGHT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    width: DAY_HIGHLIGHT_SIZE,
    height: DAY_HIGHLIGHT_SIZE,
    lineHeight: DAY_HIGHLIGHT_SIZE,
    textAlign: 'center',
  },
  carouselViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  carouselTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  quickPill: {
    width: QUICK_PILL_WIDTH,
  },
  quickRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  quickRowContent: {
    gap: QUICK_PILL_GAP,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
});

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function monthGrid(anchor: Date, weekStartsOn: WeekStartsOn) {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInCurrentMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const sundayFirstWeekday = firstDay.getDay();
  const leading = (sundayFirstWeekday - weekStartsOn + 7) % 7;
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];

  for (let i = leading - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), -i);
    cells.push({ iso: dayKeyFromDateLocal(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInCurrentMonth; day += 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({ iso: dayKeyFromDateLocal(d), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const offset = cells.length - (leading + daysInCurrentMonth) + 1;
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + 1, offset);
    cells.push({ iso: dayKeyFromDateLocal(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

function buildQuickDays(locale: string) {
  const today = new Date();
  const weekdayShortFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const total = QUICK_DAYS_BEFORE + 1 + QUICK_DAYS_AFTER;
  return Array.from({ length: total }, (_, i) => {
    const offset = i - QUICK_DAYS_BEFORE;
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const label = offset === 0 ? I18n.t('common.today') : weekdayShortFormatter.format(d);
    return { iso: dayKeyFromDateLocal(d), label, day: d.getDate() };
  });
}

function buildWeekdayLabels(locale: string, weekStartsOn: WeekStartsOn) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  // 2024-01-07 (local) is a Sunday; shift to land on the configured first-day.
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + weekStartsOn + i);
    return formatter.format(d);
  });
}

function buildMonthLabels(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2024, i, 1)));
}

export function InlineDatePicker({ value, onSelect, showQuickDays = true }: InlineDatePickerProps) {
  const themeColors = useThemeColors();
  const { settings } = useApp();
  const weekStartsOn = settings.weekStartsOn;
  const locale = I18n.locale ?? 'en';
  const parsed = parseDateKey(value);
  const initialAnchor = useMemo(() => {
    if (parsed) return new Date(parsed.year, parsed.month - 1, 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [parsed]);
  const [baseAnchor] = useState(initialAnchor);
  const [renderedOffset, setRenderedOffset] = useState(0);
  const [monthYearVisible, setMonthYearVisible] = useState(false);
  const anchor = useMemo(
    () => new Date(baseAnchor.getFullYear(), baseAnchor.getMonth() + renderedOffset, 1),
    [baseAnchor, renderedOffset],
  );
  const slots = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const offset = renderedOffset - 2 + i;
        const slotAnchor = new Date(baseAnchor.getFullYear(), baseAnchor.getMonth() + offset, 1);
        return { offset, cells: monthGrid(slotAnchor, weekStartsOn) };
      }),
    [baseAnchor, renderedOffset, weekStartsOn],
  );
  const quickDays = useMemo(
    () => (showQuickDays ? buildQuickDays(locale) : []),
    [locale, showQuickDays],
  );
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn],
  );
  const monthLabels = useMemo(() => buildMonthLabels(locale), [locale]);
  const monthLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );

  const currentOffset = useSharedValue(0);
  const gestureDelta = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const commitJs = useCallback((newOffset: number) => {
    void triggerHaptic('selection');
    setRenderedOffset(newOffset);
  }, []);

  const jumpToOffset = useCallback(
    (targetOffset: number) => {
      currentOffset.value = targetOffset;
      gestureDelta.value = 0;
      setRenderedOffset(targetOffset);
    },
    [currentOffset, gestureDelta],
  );

  const animateShift = useCallback(
    (direction: -1 | 1) => {
      const w = containerWidth;
      if (w <= 0) {
        setRenderedOffset((prev) => prev + direction);
        return;
      }
      gestureDelta.value = withTiming(
        direction === 1 ? -w : w,
        { duration: CHEVRON_ANIM_DURATION },
        (finished) => {
          if (finished) {
            currentOffset.value += direction;
            gestureDelta.value = 0;
            runOnJS(commitJs)(currentOffset.value);
          }
        },
      );
    },
    [commitJs, containerWidth, currentOffset, gestureDelta],
  );

  const handleSelect = (iso: string) => {
    void triggerHaptic('medium');
    onSelect(iso);
  };

  const openMonthYearPicker = () => {
    void triggerHaptic('selection');
    setMonthYearVisible(true);
  };

  const closeMonthYearPicker = () => {
    setMonthYearVisible(false);
  };

  const handleMonthYearSelect = (year: number, monthIndex: number) => {
    const targetOffset =
      (year - baseAnchor.getFullYear()) * 12 + (monthIndex - baseAnchor.getMonth());
    jumpToOffset(targetOffset);
    setMonthYearVisible(false);
  };

  const headerLabel = monthLabelFormatter.format(anchor);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-20, 20])
        .onUpdate((event) => {
          gestureDelta.value = event.translationX;
        })
        .onEnd((event) => {
          const w = containerWidth;
          if (w <= 0) {
            gestureDelta.value = withSpring(0, { damping: 20, stiffness: 250 });
            return;
          }
          const threshold = w * SWIPE_COMMIT_RATIO;
          if (event.translationX < -threshold || event.velocityX < -SWIPE_VELOCITY_COMMIT) {
            gestureDelta.value = withTiming(-w, { duration: SWIPE_ANIM_DURATION }, (finished) => {
              if (finished) {
                currentOffset.value += 1;
                gestureDelta.value = 0;
                runOnJS(commitJs)(currentOffset.value);
              }
            });
          } else if (event.translationX > threshold || event.velocityX > SWIPE_VELOCITY_COMMIT) {
            gestureDelta.value = withTiming(w, { duration: SWIPE_ANIM_DURATION }, (finished) => {
              if (finished) {
                currentOffset.value -= 1;
                gestureDelta.value = 0;
                runOnJS(commitJs)(currentOffset.value);
              }
            });
          } else {
            gestureDelta.value = withSpring(0, { damping: 20, stiffness: 250 });
          }
        }),
    [commitJs, containerWidth, currentOffset, gestureDelta],
  );

  const carouselStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -currentOffset.value * containerWidth + gestureDelta.value }],
  }));

  const quickRowWidthRef = useRef(0);
  const quickScrollRef = useRef<ScrollView | null>(null);
  const quickInitialScrollDoneRef = useRef(false);
  const centerTodayInQuickRow = useCallback(() => {
    const rowWidth = quickRowWidthRef.current;
    if (rowWidth <= 0) return;
    const todayCenter =
      QUICK_TODAY_INDEX * (QUICK_PILL_WIDTH + QUICK_PILL_GAP) + QUICK_PILL_WIDTH / 2;
    const offset = Math.max(0, todayCenter - rowWidth / 2);
    quickScrollRef.current?.scrollTo({ x: offset, animated: false });
  }, []);
  const handleQuickRowLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      quickRowWidthRef.current = event.nativeEvent.layout.width;
      if (!quickInitialScrollDoneRef.current) {
        quickInitialScrollDoneRef.current = true;
        centerTodayInQuickRow();
      }
    },
    [centerTodayInQuickRow],
  );

  return (
    <View className="flex-1 px-3 py-2">
      {showQuickDays ? (
        <ScrollView
          ref={quickScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={handleQuickRowLayout}
          contentContainerStyle={styles.quickRowContent}
          style={styles.quickRow}
          className="mb-5"
        >
          {quickDays.map((day) => {
            const selected = day.iso === value;
            return (
              <Pressable
                key={day.iso}
                onPress={() => handleSelect(day.iso)}
                style={styles.quickPill}
                className={cn(
                  'py-2 items-center justify-center rounded-2xl border',
                  selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40',
                )}
              >
                <Text variant="caption" className={selected ? 'text-primary' : 'text-foreground'}>
                  {day.day}
                </Text>
                <Text
                  variant="label"
                  className={selected ? 'text-primary' : 'text-muted-foreground'}
                >
                  {day.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View className="flex-row items-center justify-between mt-3 mb-5">
        <Pressable
          onPress={openMonthYearPicker}
          hitSlop={8}
          className="flex-row items-center gap-1.5 pl-3.5 pr-2.5 py-2 rounded-2xl bg-secondary/50 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={headerLabel}
        >
          <Text variant="caption" className="font-semibold text-foreground">
            {headerLabel}
          </Text>
          <ChevronDown size={14} color={themeColors.textSoft} />
        </Pressable>
        <View className="flex-row items-center gap-1.5">
          <Pressable
            onPress={() => animateShift(-1)}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.previous')}
          >
            <ChevronLeft size={18} color={themeColors.textSoft} />
          </Pressable>
          <Pressable
            onPress={() => animateShift(1)}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.next')}
          >
            <ChevronRight size={18} color={themeColors.textSoft} />
          </Pressable>
        </View>
      </View>

      <View className="flex-1">
        <View className="flex-row mb-1">
          {weekdayLabels.map((day, idx) => (
            <Text key={`wd-${idx}`} variant="label" tone="muted" style={styles.weekdayLabel}>
              {day}
            </Text>
          ))}
        </View>
        <View
          style={styles.carouselViewport}
          onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
        >
          {containerWidth > 0 ? (
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[styles.carouselTrack, carouselStyle]}>
                {slots.map((slot) => (
                  <View
                    key={`slot-${slot.offset}`}
                    style={{
                      position: 'absolute',
                      left: slot.offset * containerWidth,
                      top: 0,
                      bottom: 0,
                      width: containerWidth,
                    }}
                  >
                    {Array.from({ length: Math.ceil(slot.cells.length / 7) }).map((_, rowIdx) => (
                      <View key={`row-${rowIdx}`} className="flex-row">
                        {slot.cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, cellIdx) => {
                          if (!cell.inMonth) {
                            return <View key={`${cell.iso}-${cellIdx}`} style={styles.dayCell} />;
                          }
                          const selected = slot.offset === renderedOffset && cell.iso === value;
                          return (
                            <Pressable
                              key={`${cell.iso}-${cellIdx}`}
                              onPress={() => handleSelect(cell.iso)}
                              style={styles.dayCell}
                            >
                              <View
                                style={[
                                  styles.dayHighlight,
                                  selected ? { backgroundColor: themeColors.primary } : null,
                                ]}
                              >
                                <Text
                                  variant="label"
                                  style={[styles.dayNumber, selected ? { color: '#FFFFFF' } : null]}
                                >
                                  {cell.day}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ))}
              </Animated.View>
            </GestureDetector>
          ) : null}
        </View>
      </View>

      <MonthYearWheelPicker
        visible={monthYearVisible}
        year={anchor.getFullYear()}
        monthIndex={anchor.getMonth()}
        baseYear={baseAnchor.getFullYear()}
        monthLabels={monthLabels}
        onSelect={handleMonthYearSelect}
        onClose={closeMonthYearPicker}
      />
    </View>
  );
}
