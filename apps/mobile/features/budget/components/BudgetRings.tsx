import React from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import {
  RING_ORDER,
  RING_STROKE as STROKE,
  ringAtDistance,
  ringRadius as radiusOf,
} from '~/features/budget/lib/budgetRings';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetPeriod } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

/** One budget drawn as a ring: outermost the year, then the month, then the week. */
export interface BudgetRing {
  period: BudgetPeriod;
  /** spent / budget; the arc stops at a full circle. */
  usageRatio: number;
  /** "71%", shown in the legend. */
  percentLabel: string;
  isOver: boolean;
}

/** Each period keeps its own colour so a ring is recognisable at a glance. */
export function budgetRingColor(period: BudgetPeriod, themeColors: ColorPalette): string {
  if (period === 'month') return themeColors.primary;
  if (period === 'year') return themeColors.success;
  return themeColors.accent;
}

/**
 * The year, month and week budgets as nested rings around the focused
 * budget's figure (the `children`). The focused ring is drawn full strength
 * and the others faded; tapping a ring, or its legend entry, focuses it.
 */
export function BudgetRings({
  rings,
  focused,
  size,
  themeColors,
  onFocus,
  children,
}: {
  /** The rings to draw; a period without a budget is left out. */
  rings: BudgetRing[];
  focused: BudgetPeriod | null;
  size: number;
  themeColors: ColorPalette;
  onFocus: (period: BudgetPeriod) => void;
  children: React.ReactNode;
}) {
  // Rings keep their place (year outside, week inside) even when one is
  // missing, so a period never jumps to another ring.
  const placed = RING_ORDER.map((period, index) => ({
    index,
    ring: rings.find((candidate) => candidate.period === period) ?? null,
  }));
  const center = size / 2;
  const innerRadius = radiusOf(RING_ORDER.length - 1, size) - STROKE / 2;

  // Which ring a tap landed on, by its distance from the centre.
  const handlePress = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const period = ringAtDistance(
      Math.hypot(locationX - center, locationY - center),
      size,
      rings.map((ring) => ring.period),
    );
    if (period && period !== focused) {
      void triggerHaptic('selection');
      onFocus(period);
    }
  };

  return (
    <View className="items-center">
      <Pressable
        onPress={handlePress}
        // Screen readers use the legend below, which lists the same rings.
        accessible={false}
        style={{ width: size, height: size }}
        className="items-center justify-center"
      >
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          {placed.map(({ index, ring }) => {
            const radius = radiusOf(index, size);
            const circumference = 2 * Math.PI * radius;
            if (!ring) {
              return (
                <Circle
                  key={index}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={withColorAlpha(themeColors.border, 0.25)}
                  strokeWidth={STROKE}
                  strokeDasharray="2 8"
                  fill="none"
                />
              );
            }
            const color = budgetRingColor(ring.period, themeColors);
            const dim = focused != null && ring.period !== focused;
            const filled = circumference * Math.max(0, Math.min(ring.usageRatio, 1));
            return (
              <React.Fragment key={index}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={withColorAlpha(color, dim ? 0.08 : 0.16)}
                  strokeWidth={STROKE}
                  fill="none"
                />
                {filled > 0 ? (
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={withColorAlpha(color, dim ? 0.35 : 1)}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${Math.max(0, circumference - filled)}`}
                    transform={`rotate(-90 ${center} ${center})`}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
        {/* Taps pass through the figure to the rings' own hit test. */}
        <View
          pointerEvents="none"
          className="items-center justify-center"
          style={{ width: innerRadius * 2 - 8 }}
        >
          {children}
        </View>
      </Pressable>

      <View className="mt-4 flex-row justify-center gap-1">
        {placed.map(({ ring }) =>
          ring ? (
            <Pressable
              key={ring.period}
              onPress={() => {
                if (ring.period === focused) return;
                void triggerHaptic('selection');
                onFocus(ring.period);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: ring.period === focused }}
              accessibilityLabel={`${I18n.t(`budget.ring_${ring.period}`)}, ${ring.percentLabel}`}
              className={cn(
                'flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5 active:opacity-70',
                ring.period === focused ? 'bg-secondary/60' : '',
              )}
            >
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: budgetRingColor(ring.period, themeColors) }}
              />
              <Text
                variant="caption"
                tone={ring.period === focused ? undefined : 'muted'}
                className={cn(ring.period === focused && 'text-foreground')}
              >
                {I18n.t(`budget.ring_${ring.period}`)}{' '}
                <Text
                  variant="caption"
                  style={ring.isOver ? { color: themeColors.error } : undefined}
                >
                  {ring.percentLabel}
                </Text>
              </Text>
            </Pressable>
          ) : null,
        )}
      </View>
    </View>
  );
}
