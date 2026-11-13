import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export interface BreakdownMemberChoice {
  key: string;
  name: string;
  /** Their avatar, or the Everyone glyph. */
  icon: React.ReactNode;
}

/**
 * Whose spending an album's Breakdown shows: everyone, or one person's share.
 * One line on the page opens it, however many people the album has; picking
 * one closes it.
 */
export function BreakdownMemberSheet({
  visible,
  choices,
  selectedKey,
  onSelect,
  onClose,
}: {
  visible: boolean;
  choices: readonly BreakdownMemberChoice[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="70%"
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}
    >
      <View className="items-center pt-2.5">
        <View className="h-1 w-10 rounded-full bg-border/60" />
      </View>
      <Text variant="subheading" className="px-6 pb-2 pt-4">
        {I18n.t('albums.breakdown_showing')}
      </Text>
      <ScrollView>
        {choices.map((choice, index) => {
          const selected = choice.key === selectedKey;
          return (
            <Pressable
              key={choice.key}
              onPress={() => {
                void triggerHaptic('selection');
                onSelect(choice.key);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={choice.name}
              testID={`album-breakdown-member-${choice.key}`}
              className={
                index > 0
                  ? 'mx-4 flex-row items-center gap-3 border-t border-border/15 px-2 py-3 active:opacity-70'
                  : 'mx-4 flex-row items-center gap-3 px-2 py-3 active:opacity-70'
              }
            >
              {choice.icon}
              <Text
                variant="body"
                numberOfLines={1}
                className={selected ? 'flex-1 text-primary' : 'flex-1'}
              >
                {choice.name}
              </Text>
              {selected ? <Check size={18} color={themeColors.primary} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheetModal>
  );
}
