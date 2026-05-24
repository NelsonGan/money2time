import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { dayKeyFromDateLocal } from '~/utils/formatters';

interface QuickAddInlineDatePickerProps {
  value: string;
  onSelect: (date: string) => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const styles = StyleSheet.create({
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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

function monthGrid(anchor: Date) {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInCurrentMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const firstWeekday = firstDay.getDay();
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), -i);
    cells.push({ iso: dayKeyFromDateLocal(d), day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInCurrentMonth; day += 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({ iso: dayKeyFromDateLocal(d), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const offset = cells.length - (firstWeekday + daysInCurrentMonth) + 1;
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + 1, offset);
    cells.push({ iso: dayKeyFromDateLocal(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

function buildQuickDays() {
  const today = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const label =
      i === 0
        ? I18n.t('common.today')
        : i === 1
          ? I18n.t('common.yesterday')
          : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
    return { iso: dayKeyFromDateLocal(d), label, day: d.getDate() };
  });
}

export function QuickAddInlineDatePicker({ value, onSelect }: QuickAddInlineDatePickerProps) {
  const themeColors = useThemeColors();
  const parsed = parseDateKey(value);
  const initialAnchor = useMemo(() => {
    if (parsed) return new Date(parsed.year, parsed.month - 1, 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [parsed]);
  const [anchor, setAnchor] = useState(initialAnchor);
  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const quickDays = useMemo(() => buildQuickDays(), []);

  const shiftMonth = (direction: -1 | 1) => {
    void triggerHaptic('selection');
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const handleSelect = (iso: string) => {
    void triggerHaptic('selection');
    onSelect(iso);
  };

  return (
    <View className="flex-1 px-3 py-3">
      <View className="flex-row gap-2 mb-2">
        {quickDays.map((day) => {
          const selected = day.iso === value;
          return (
            <Pressable
              key={day.iso}
              onPress={() => handleSelect(day.iso)}
              className={cn(
                'flex-1 py-2 items-center justify-center rounded-2xl border',
                selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40',
              )}
            >
              <Text variant="caption" className={selected ? 'text-primary' : 'text-foreground'}>
                {day.day}
              </Text>
              <Text variant="label" className={selected ? 'text-primary' : 'text-muted-foreground'}>
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between mb-1">
        <Pressable
          onPress={() => shiftMonth(-1)}
          className="w-7 h-7 rounded-full items-center justify-center bg-secondary/60"
        >
          <ChevronLeft size={13} color={themeColors.textSoft} />
        </Pressable>
        <Text variant="caption">{MONTH_LABEL_FORMATTER.format(anchor)}</Text>
        <Pressable
          onPress={() => shiftMonth(1)}
          className="w-7 h-7 rounded-full items-center justify-center bg-secondary/60"
        >
          <ChevronRight size={13} color={themeColors.textSoft} />
        </Pressable>
      </View>

      <View className="flex-row justify-between">
        {WEEKDAY_LABELS.map((day, idx) => (
          <Text key={`wd-${idx}`} variant="label" tone="muted" className="w-[14.28%] text-center">
            {day}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap flex-1">
        {cells.map((cell, idx) => {
          const selected = cell.iso === value;
          return (
            <Pressable
              key={`${cell.iso}-${idx}`}
              onPress={() => handleSelect(cell.iso)}
              style={styles.dayCell}
            >
              <View
                className={cn(
                  'w-8 h-8 rounded-full items-center justify-center',
                  selected ? 'bg-primary' : 'bg-transparent',
                )}
              >
                <Text
                  variant="label"
                  style={selected ? { color: '#FFFFFF' } : undefined}
                  className={cn(
                    !selected && (cell.inMonth ? 'text-foreground' : 'text-muted-foreground/60'),
                  )}
                >
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
