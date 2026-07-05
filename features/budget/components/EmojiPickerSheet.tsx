import { X } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji, Text, ThemeModal } from '~/components/ui';
import { CATEGORY_ICON_PICKER_VALUES } from '~/constants/categoryIcons';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

interface EmojiPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  selected: string | null;
  /** null clears the emoji. */
  onSelect: (emoji: string | null) => void;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '60%',
  },
});

/** Bottom sheet with the category emoji set, for picking a template emoji. */
export function EmojiPickerSheet({ visible, onClose, selected, onSelect }: EmojiPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const pick = (emoji: string | null) => {
    void triggerHaptic('selection');
    onSelect(emoji);
    onClose();
  };

  return (
    <ThemeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            className="rounded-t-[28px] bg-card"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="flex-row items-center gap-2 px-5 pb-4 pt-5">
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {I18n.t('budget.choose_emoji')}
              </Text>
              <View className="flex-1" />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
              >
                <X size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
              <View className="flex-row flex-wrap gap-2 pb-4">
                <Pressable
                  onPress={() => pick(null)}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('categories.none')}
                  accessibilityState={{ selected: !selected }}
                  className={cn(
                    'h-11 items-center justify-center rounded-full border px-3',
                    !selected
                      ? 'border-primary/50 bg-primary/15'
                      : 'border-border/40 bg-secondary/20',
                  )}
                >
                  <Text
                    variant="caption"
                    className={cn(!selected ? 'text-primary' : 'text-muted-foreground')}
                  >
                    {I18n.t('categories.none')}
                  </Text>
                </Pressable>
                {(selected && !CATEGORY_ICON_PICKER_VALUES.includes(selected)
                  ? [selected, ...CATEGORY_ICON_PICKER_VALUES]
                  : CATEGORY_ICON_PICKER_VALUES
                ).map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => pick(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                    accessibilityState={{ selected: selected === emoji }}
                    className={cn(
                      'h-11 w-11 items-center justify-center rounded-full border',
                      selected === emoji
                        ? 'border-primary/50 bg-primary/15'
                        : 'border-border/40 bg-secondary/20',
                    )}
                  >
                    <CategoryEmoji icon={emoji} size={22} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
