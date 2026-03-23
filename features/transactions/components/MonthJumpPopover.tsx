import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatMonthYearLabel, startOfMonthDate } from '~/utils/formatters';

const SIDE_MARGIN = 12;
const CARD_WIDTH = 408;

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 18,
  },
  gridItem: {
    width: '31.6%',
  },
});

function clampNumber(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function monthLabelsForYear(year: number, locale: string) {
  return Array.from({ length: 12 }, (_, monthIndex) =>
    new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(locale, {
      month: 'short',
      timeZone: 'UTC',
    }),
  );
}

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function MonthJumpPopover({
  visible,
  anchorRect,
  screenWidth,
  screenHeight,
  locale,
  currentMonthDate,
  onClose,
  onSelectMonth,
}: {
  visible: boolean;
  anchorRect: AnchorRect | null;
  screenWidth: number;
  screenHeight: number;
  locale: string;
  currentMonthDate: Date;
  onClose: () => void;
  onSelectMonth: (monthDate: Date) => void;
}) {
  const themeColors = useThemeColors();
  const [visibleYear, setVisibleYear] = useState(currentMonthDate.getFullYear());

  useEffect(() => {
    if (!visible) return;
    setVisibleYear(currentMonthDate.getFullYear());
  }, [currentMonthDate, visible]);

  const monthOptions = useMemo(() => monthLabelsForYear(visibleYear, locale), [locale, visibleYear]);
  const activeMonthLabel = useMemo(
    () => formatMonthYearLabel(currentMonthDate, locale),
    [currentMonthDate, locale],
  );
  const cardWidth = Math.min(screenWidth - SIDE_MARGIN * 2, CARD_WIDTH);
  const anchorCenterX = anchorRect ? anchorRect.x + anchorRect.width / 2 : screenWidth / 2;
  const cardLeft = clampNumber(
    anchorCenterX - cardWidth / 2,
    SIDE_MARGIN,
    screenWidth - cardWidth - SIDE_MARGIN,
  );
  const cardTop = Math.max(
    SIDE_MARGIN,
    (anchorRect?.y ?? spacing.xl * 2) + (anchorRect?.height ?? 0) + spacing.xs,
  );
  const maxCardHeight = Math.max(220, screenHeight - cardTop - SIDE_MARGIN);

  const selectMonth = useCallback(
    (monthDate: Date) => {
      void triggerHaptic('selection');
      onSelectMonth(startOfMonthDate(monthDate));
    },
    [onSelectMonth],
  );

  if (!visible) return null;

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1" pointerEvents="box-none">
        <Pressable
          className="absolute inset-0 bg-black/15"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
        />

        <View
          className="rounded-[28px] bg-background overflow-hidden"
          style={[
            styles.card,
            {
              left: cardLeft,
              top: cardTop,
              width: cardWidth,
              maxHeight: maxCardHeight,
              borderColor: themeColors.border,
              shadowColor: themeColors.text,
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View className="gap-4 p-4">
              <View className="min-h-9 items-center justify-center">
                <View className="flex-row items-center justify-center gap-2">
                  <CalendarDays size={18} color={themeColors.text} />
                  <Text variant="subheading" className="text-foreground">
                    {activeMonthLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  className="absolute right-0 top-0 h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                >
                  <X size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => setVisibleYear((previous) => previous - 1)}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.previous')}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                >
                  <ChevronLeft size={16} color={themeColors.textMuted} />
                </Pressable>
                <View className="rounded-full border border-border/35 bg-secondary/45 px-3 py-1.5">
                  <Text variant="label" className="text-foreground">
                    {visibleYear}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setVisibleYear((previous) => previous + 1)}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.next')}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary/70 active:opacity-80"
                >
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <View className="flex-row flex-wrap justify-between gap-y-2">
                {monthOptions.map((label, monthIndex) => {
                  const isSelected =
                    currentMonthDate.getFullYear() === visibleYear &&
                    currentMonthDate.getMonth() === monthIndex;
                  return (
                    <Pressable
                      key={`${visibleYear}-${monthIndex}`}
                      onPress={() => selectMonth(new Date(visibleYear, monthIndex, 1))}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isSelected }}
                      style={styles.gridItem}
                      className={cn(
                        'rounded-2xl border px-3 py-3 items-center',
                        isSelected
                          ? 'border-primary/50 bg-primary/12'
                          : 'border-border/40 bg-card',
                      )}
                    >
                      <Text
                        variant="caption"
                        className={cn(isSelected ? 'text-primary' : 'text-foreground')}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </ThemeModal>
  );
}
