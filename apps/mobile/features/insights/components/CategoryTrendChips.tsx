import { Plus, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

export type CategoryTrendChipOption = { id: string; label: string; emoji: string };

/**
 * The Category trend's picker: every expense category as a chip, biggest
 * spend first. Tapping a chip charts it. The leading "Compare" chip arms the
 * next tap to add a second line instead; the compared chip carries an × to
 * drop it. The two picks wear their line colours, so the chips double as the
 * chart's legend.
 *
 * It sits in the header, outside the period pager, so scrolling it never
 * turns the page.
 */
export const CategoryTrendChips = React.memo(function CategoryTrendChipsImpl({
  options,
  primaryId,
  compareId,
  primaryColor,
  compareColor,
  isPickingCompare,
  onSelect,
  onToggleCompare,
  onRemoveCompare,
}: {
  options: readonly CategoryTrendChipOption[];
  primaryId: string | null;
  compareId: string | null;
  primaryColor: string;
  compareColor: string;
  isPickingCompare: boolean;
  onSelect: (id: string) => void;
  onToggleCompare: () => void;
  onRemoveCompare: () => void;
}) {
  const themeColors = useThemeColors();
  if (options.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {compareId ? null : (
        // First in the row, so it is seen before the categories scroll away.
        // Armed, it says what to do next and a tap cancels it.
        <Pressable
          onPress={onToggleCompare}
          accessibilityRole="button"
          accessibilityState={{ selected: isPickingCompare }}
          accessibilityLabel={
            isPickingCompare ? I18n.t('insights.compare.pick_hint') : I18n.t('insights.compare.add')
          }
          className="flex-row items-center gap-1 rounded-full px-3 active:opacity-70"
          style={[
            styles.chip,
            styles.compareChip,
            {
              borderColor: withColorAlpha(themeColors.primary, isPickingCompare ? 0.9 : 0.5),
              backgroundColor: isPickingCompare
                ? withColorAlpha(themeColors.primary, 0.12)
                : 'transparent',
            },
          ]}
        >
          {isPickingCompare ? (
            <X size={13} color={themeColors.primary} strokeWidth={2.5} />
          ) : (
            <Plus size={13} color={themeColors.primary} strokeWidth={2.5} />
          )}
          <Text variant="caption" numberOfLines={1} style={{ color: themeColors.primary }}>
            {isPickingCompare
              ? I18n.t('insights.compare.pick_hint')
              : I18n.t('insights.compare.add')}
          </Text>
        </Pressable>
      )}
      {options.map((option) => {
        const ring =
          option.id === primaryId ? primaryColor : option.id === compareId ? compareColor : null;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: ring !== null }}
            accessibilityLabel={option.label}
            className="flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
            style={[
              styles.chip,
              ring
                ? { borderColor: ring, backgroundColor: withColorAlpha(ring, 0.1) }
                : {
                    borderColor: withColorAlpha(themeColors.border, 0.7),
                    backgroundColor: themeColors.card,
                  },
            ]}
          >
            <CategoryEmoji icon={option.emoji} size={16} />
            <Text
              variant="caption"
              numberOfLines={1}
              style={{ color: ring ? themeColors.text : themeColors.textSoft }}
            >
              {option.label}
            </Text>
            {option.id === compareId ? (
              <Pressable
                onPress={onRemoveCompare}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('insights.compare.remove')}
              >
                <X size={13} color={themeColors.textMuted} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingHorizontal: 2,
  },
  chip: {
    height: 32,
    borderWidth: 1.5,
  },
  compareChip: {
    borderStyle: 'dashed',
  },
});
