import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatCompactNumber } from '~/utils/formatters';

import {
  type CalendarGridCell,
  type CalendarMonthData,
  formatCalendarDate,
} from '../lib/calendarBuild';

interface CalendarMonthGridProps {
  monthData: CalendarMonthData;
  weekdayLabels: string[];
  selectedDayKey: string | null;
  isTimeMode: boolean;
  locale: string;
  onSelectDay: (dayKey: string) => void;
  chartWidth: number;
}

function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function formatCellCompact(value: number, isTimeMode: boolean): string {
  if (value <= 0) return '0';
  const abs = Math.abs(value);
  if (isTimeMode) {
    if (abs < 1) return `${Math.round(abs * 60)}m`;
    return `${formatCompactNumber(abs)}h`;
  }
  return formatCompactNumber(abs);
}

const DAY_CELL_GAP = 5;

export const CalendarMonthGrid = memo(function CalendarMonthGrid({
  monthData,
  weekdayLabels,
  selectedDayKey,
  isTimeMode,
  locale,
  onSelectDay,
  chartWidth,
}: CalendarMonthGridProps) {
  const themeColors = useThemeColors();
  const dayCellSize = Math.max(40, Math.floor((chartWidth - DAY_CELL_GAP * 6) / 7));
  const dayCellHeight = Math.min(dayCellSize + 14, 62);
  const gridWidth = dayCellSize * 7 + DAY_CELL_GAP * 6;

  const handlePress = useCallback(
    (dayKey: string) => {
      void triggerHaptic('selection');
      onSelectDay(dayKey);
    },
    [onSelectDay],
  );

  const renderCell = (cell: CalendarGridCell) => {
    if (cell.kind === 'spacer') {
      return <View key={cell.id} style={{ width: dayCellSize, height: dayCellHeight }} />;
    }

    const isSelected = cell.dayKey === selectedDayKey;
    const hasActivity = cell.transactionCount > 0;
    const incomeStronger = cell.income > cell.expense;
    const expenseStronger = cell.expense > cell.income;
    const intensity =
      hasActivity && monthData.maxAbsNet > 0
        ? Math.max(0.18, Math.min(0.85, Math.abs(cell.net) / monthData.maxAbsNet))
        : 0;

    let bgColor: string;
    let borderColor: string;
    if (isSelected) {
      bgColor = withColorAlpha(themeColors.primary, 0.22);
      borderColor = withColorAlpha(themeColors.primary, 0.9);
    } else if (hasActivity) {
      if (incomeStronger) {
        bgColor = withColorAlpha(themeColors.success, 0.06 + intensity * 0.22);
        borderColor = withColorAlpha(themeColors.success, 0.2 + intensity * 0.3);
      } else if (expenseStronger) {
        bgColor = withColorAlpha(themeColors.error, 0.06 + intensity * 0.22);
        borderColor = withColorAlpha(themeColors.error, 0.2 + intensity * 0.3);
      } else {
        bgColor = withColorAlpha(themeColors.textMuted, 0.1);
        borderColor = withColorAlpha(themeColors.textMuted, 0.25);
      }
    } else if (cell.isFuture) {
      bgColor = withColorAlpha(themeColors.sky, 0.06);
      borderColor = withColorAlpha(themeColors.textMuted, 0.15);
    } else {
      bgColor = withColorAlpha(themeColors.surfaceMuted, 0.55);
      borderColor = withColorAlpha(themeColors.textMuted, 0.16);
    }

    const dayNumberClass = isSelected
      ? 'text-primary font-bold'
      : incomeStronger
        ? 'text-success'
        : expenseStronger
          ? 'text-destructive'
          : 'text-muted-foreground';

    return (
      <Pressable
        key={cell.id}
        onPress={() => handlePress(cell.dayKey)}
        accessibilityRole="button"
        accessibilityLabel={formatCalendarDate(cell.dayKey, locale)}
        accessibilityState={{ selected: isSelected }}
        style={[
          styles.dayCell,
          {
            width: dayCellSize,
            height: dayCellHeight,
            backgroundColor: bgColor,
            borderColor,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        <Text variant="caption" className={cn(dayNumberClass)}>
          {cell.dayNumber}
        </Text>
        <View style={styles.cellValues}>
          {hasActivity ? (
            <>
              <RNText
                allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.cellValueText,
                  {
                    color: cell.income > 0 ? themeColors.success : themeColors.textMuted,
                    opacity: cell.income > 0 ? 1 : 0.55,
                    maxWidth: dayCellSize - 4,
                  },
                ]}
              >
                {formatCellCompact(cell.income, isTimeMode)}
              </RNText>
              <RNText
                allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.cellValueText,
                  {
                    color: cell.expense > 0 ? themeColors.error : themeColors.textMuted,
                    opacity: cell.expense > 0 ? 1 : 0.55,
                    maxWidth: dayCellSize - 4,
                  },
                ]}
              >
                {formatCellCompact(cell.expense, isTimeMode)}
              </RNText>
            </>
          ) : (
            <RNText
              allowFontScaling={false}
              style={[styles.cellValueText, { color: themeColors.textMuted, opacity: 0.4 }]}
            >
              —
            </RNText>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ width: gridWidth }}>
      <View style={[styles.weekdayRow, { gap: DAY_CELL_GAP }]}>
        {weekdayLabels.map((label, index) => (
          <View key={`weekday-${index}`} style={[styles.weekdayCell, { width: dayCellSize }]}>
            <Text variant="label" tone="muted">
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.grid, { gap: DAY_CELL_GAP }]}>{monthData.cells.map(renderCell)}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCell: {
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    borderRadius: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  cellValues: {
    marginTop: 'auto',
    paddingBottom: 4,
    alignItems: 'center',
    gap: 1,
  },
  cellValueText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
