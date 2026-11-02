import React from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

export type InsightSubTabOption = {
  value: string;
  label: string;
  /** A clay icon drawn above the label; with icons the tabs become an icon row. */
  icon?: ImageSourcePropType;
};

/**
 * The tabs inside a grouped Insights page (Breakdown: Expense / Income;
 * Trends: Expense / Income / Category / Assets). Plain text tabs with a short
 * underline under the selected one, so they read as part of the title rather
 * than as another bar.
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
      className="flex-row justify-center"
    >
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        // The class list stays the same in every state: NativeWind re-wraps a
        // component whose pseudo-classes come and go between renders, which
        // throws after the first mount. Selection is drawn with style.
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            hitSlop={{ top: 6, bottom: 6 }}
            className="min-h-9 flex-1 items-center justify-center px-1 active:opacity-70"
          >
            {option.icon ? (
              <View
                style={[
                  styles.iconTile,
                  {
                    backgroundColor: isSelected
                      ? withColorAlpha(themeColors.primary, 0.12)
                      : 'transparent',
                  },
                ]}
              >
                <Image source={option.icon} resizeMode="contain" style={styles.icon} />
              </View>
            ) : null}
            <Text
              variant="body"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={[
                styles.label,
                option.icon ? styles.iconLabel : null,
                isSelected
                  ? { color: themeColors.primary, fontFamily: FONT.bold }
                  : { color: themeColors.textMuted },
              ]}
            >
              {option.label}
            </Text>
            {option.icon ? null : (
              <View
                style={[
                  styles.underline,
                  { backgroundColor: isSelected ? themeColors.primary : 'transparent' },
                ]}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    fontSize: 15,
    lineHeight: 20,
  },
  iconLabel: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  iconTile: {
    width: 44,
    height: 40,
    marginBottom: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 30,
    height: 30,
  },
  underline: {
    marginTop: 4,
    width: 22,
    height: 3,
    borderRadius: 2,
  },
});
