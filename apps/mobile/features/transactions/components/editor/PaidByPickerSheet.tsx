import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/** Someone who can have paid the bill: the user, or a person on it. */
export interface PaidByOption {
  /** Stable across renders: the row's id, else its position. */
  key: string;
  /** Null for the user. */
  rowIndex: number | null;
  name: string;
  /** The key the person's avatar colour comes from; null for the user. */
  partyKey: string | null;
  selected: boolean;
}

interface PaidByPickerSheetProps {
  visible: boolean;
  options: PaidByOption[];
  onClose: () => void;
  /** The row that paid, or null for the user. */
  onSelect: (rowIndex: number | null) => void;
}

/**
 * Who paid the bill: the user, or one of the people on it. A short list with a
 * tick on the current payer; picking one closes the sheet.
 */
export function PaidByPickerSheet({ visible, options, onClose, onSelect }: PaidByPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable accessible={false} className="absolute inset-0 bg-black/40" onPress={onClose} />
        <View
          className="max-h-[70%] overflow-hidden rounded-t-[28px] bg-background"
          style={[sheetColumnStyle, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}
        >
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border/60" />
          </View>
          <Text variant="subheading" className="px-6 pb-2 pt-4 text-center">
            {I18n.t('transactions.editor.split.paid_by_label')}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map((option, index) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  void triggerHaptic('selection');
                  onSelect(option.rowIndex);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: option.selected }}
                className={
                  index > 0
                    ? 'mx-4 flex-row items-center gap-3 border-t border-border/15 px-2 py-3 active:opacity-70'
                    : 'mx-4 flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                }
              >
                <PersonAvatar name={option.name} partyKey={option.partyKey} size={36} />
                <Text variant="body" numberOfLines={1} className="flex-1">
                  {option.name}
                </Text>
                {option.selected ? <Check size={18} color={themeColors.primary} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </ThemeModal>
  );
}
