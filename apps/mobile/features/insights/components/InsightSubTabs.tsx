import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';

export type InsightSubTabOption = { value: string; label: string };

/**
 * The tabs inside a grouped Insights page (Breakdown: Expense / Income;
 * Trends: Expense / Income / Category / Assets). A segmented control: the
 * selected tab is a filled pill, the rest sit on the shared track.
 */
export const InsightSubTabs = React.memo(function InsightSubTabsImpl({
  options,
  selectedValue,
  onSelect,
  accessibilityLabel,
}: {
  options: readonly InsightSubTabOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  accessibilityLabel?: string;
}) {
  const themeColors = useThemeColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-pill bg-secondary/40 p-1"
    >
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        // The class list stays the same for every state: NativeWind re-wraps a
        // component whose pseudo-classes appear or disappear between renders,
        // which throws outside a fresh mount. Selection is drawn with style.
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            hitSlop={{ top: 4, bottom: 4 }}
            className="min-h-9 flex-1 items-center justify-center rounded-pill px-2 active:opacity-80"
            style={isSelected ? { backgroundColor: themeColors.primary } : undefined}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{ color: isSelected ? '#FFFFFF' : themeColors.textMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});
