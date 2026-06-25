import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import type { WeekStartsOn } from '~/types';
import type { CalendarDayAggregate } from '../lib/calendarBuild';
import { dayKeyToUtcDate, weekDayKeys, weekStartDayKey } from '../lib/calendarBuild';

interface CalendarWeekStripProps {
  selectedDayKey: string;
  todayDayKey: string;
  weekdayLabels: string[];
  weekStartsOn: WeekStartsOn;
  dailyByDayKey: Map<string, CalendarDayAggregate>;
  onSelectDay: (dayKey: string) => void;
}

export const CalendarWeekStrip = memo(function CalendarWeekStrip({
  selectedDayKey,
  todayDayKey,
  weekdayLabels,
  weekStartsOn,
  dailyByDayKey,
  onSelectDay,
}: CalendarWeekStripProps) {
  const themeColors = useThemeColors();
  const wsKey = useMemo(
    () => weekStartDayKey(selectedDayKey, weekStartsOn),
    [selectedDayKey, weekStartsOn],
  );
  const days = useMemo(() => weekDayKeys(wsKey), [wsKey]);

  return (
    <View style={styles.weekPage}>
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
              style={styles.dayColumn}
            >
              <Text variant="label" tone="muted" style={styles.weekdayLabelText}>
                {weekdayLabels[i]}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  isSelected && { backgroundColor: themeColors.primary },
                  isToday &&
                    !isSelected && {
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
                      backgroundColor: isSelected ? themeColors.primary : themeColors.textMuted,
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

const styles = StyleSheet.create({
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
