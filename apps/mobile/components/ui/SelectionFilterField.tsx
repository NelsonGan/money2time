import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import type { ColorPalette } from '~/constants/designSystem';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';
import type { SelectionFilterMode } from '~/utils/selectionFilter';

import { Text } from './text';

const MODES: readonly SelectionFilterMode[] = ['exclude', 'include'];

/**
 * One row of a filter sheet: a caption naming what is filtered, an
 * Exclude | Include switch for how the picks are read, and the card that opens
 * the picker. The switch flips this filter alone, so "only my card" can sit
 * next to "but not rent".
 *
 * Include is the inverted, less usual reading, so it is the one drawn in the
 * theme accent (on the switch and in the card's count); exclude stays neutral,
 * which leaves the sheet looking exactly as it did for anyone who never flips it.
 */
export function SelectionFilterField({
  label,
  mode,
  count,
  emptyLabel,
  onModeChange,
  onPress,
}: {
  label: string;
  mode: SelectionFilterMode;
  count: number;
  /** What an empty exclude reads as; an empty include always reads "All". */
  emptyLabel: string;
  onModeChange: (mode: SelectionFilterMode) => void;
  onPress: () => void;
}) {
  const themeColors = useThemeColors();
  // What reads on the primary fill: white over light themes' deep primary, the
  // page colour over dark themes' pale one (the --primary-foreground pairing).
  const onPrimary = useResolvedTheme() === 'dark' ? themeColors.background : '#FFFFFF';
  const including = mode === 'include';
  const value =
    count > 0
      ? `${count} ${I18n.t(including ? 'insights.filters.included' : 'insights.filters.excluded')}`
      : including
        ? I18n.t('insights.filters.all')
        : emptyLabel;

  return (
    <View className="gap-2">
      <View className="flex-row items-end justify-between gap-3">
        <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
          {label}
        </Text>
        <View
          className="flex-row rounded-full border border-border/30 bg-secondary/40 p-0.5"
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
        >
          {MODES.map((option) => {
            const active = option === mode;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  if (active) return;
                  void triggerHaptic('selection');
                  onModeChange(option);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                hitSlop={{ top: 6, bottom: 6 }}
                // The class list never changes between states; only `style`
                // does. Swapping in a variable-backed class (bg-primary,
                // shadow-soft) on toggle makes NativeWind "upgrade" the chip,
                // which remounts it and, in dev, crashed while logging why.
                className="min-w-[64px] items-center rounded-full border px-3 py-1"
                style={chipStyle(option, active, themeColors)}
              >
                <Text
                  variant="caption"
                  style={{ color: chipTextColor(option, active, themeColors, onPrimary) }}
                >
                  {I18n.t(
                    option === 'include'
                      ? 'insights.filters.mode_include'
                      : 'insights.filters.mode_exclude',
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
      >
        <Text
          variant="body"
          tone={count > 0 || including ? undefined : 'muted'}
          style={including && count > 0 ? { color: themeColors.primary } : undefined}
        >
          {value}
        </Text>
        <ChevronRight size={16} color={themeColors.textMuted} />
      </Pressable>
    </View>
  );
}

function chipStyle(option: SelectionFilterMode, active: boolean, colors: ColorPalette) {
  if (!active) return { backgroundColor: 'transparent', borderColor: 'transparent' };
  return option === 'include'
    ? { backgroundColor: colors.primary, borderColor: colors.primary }
    : { backgroundColor: colors.card, borderColor: withColorAlpha(colors.border, 0.3) };
}

function chipTextColor(
  option: SelectionFilterMode,
  active: boolean,
  colors: ColorPalette,
  onPrimary: string,
) {
  if (!active) return colors.textMuted;
  return option === 'include' ? onPrimary : colors.text;
}
