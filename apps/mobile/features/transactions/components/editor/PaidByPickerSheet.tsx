import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/** Someone who can have paid the bill: the user, or a person on it (or in its shared album). */
export interface PaidByOption {
  /** Stable across renders: the row's id, else its position. */
  key: string;
  /** Null for the user, and for a member of a shared album not on the bill yet. */
  rowIndex: number | null;
  /** A shared album's member not on the bill yet: choosing them puts them on it. */
  member?: { id: string; name: string };
  name: string;
  /** The key the person's avatar colour comes from; null for the user. */
  partyKey: string | null;
  selected: boolean;
}

interface PaidByPickerSheetProps {
  visible: boolean;
  options: PaidByOption[];
  onClose: () => void;
  /** Who paid. */
  onSelect: (option: PaidByOption) => void;
}

/**
 * Who paid the bill: the user, or one of the people on it. A short list with a
 * tick on the current payer; picking one closes the sheet.
 */
export function PaidByPickerSheet({ visible, options, onClose, onSelect }: PaidByPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const selfAvatarUri = useSelfPerson().avatarUri;

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
      <Text variant="subheading" className="px-6 pb-2 pt-4 text-center">
        {I18n.t('transactions.editor.split.paid_by_label')}
      </Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {options.map((option, index) => (
          <Pressable
            key={option.key}
            onPress={() => {
              void triggerHaptic('selection');
              onSelect(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.selected }}
            className={
              index > 0
                ? 'mx-4 flex-row items-center gap-3 border-t border-border/15 px-2 py-3 active:opacity-70'
                : 'mx-4 flex-row items-center gap-3 px-2 py-3 active:opacity-70'
            }
          >
            <PersonAvatar
              name={option.name}
              partyKey={option.partyKey}
              size={36}
              imageUri={option.partyKey === null ? selfAvatarUri : null}
            />
            <Text variant="body" numberOfLines={1} className="flex-1">
              {option.name}
            </Text>
            {option.selected ? <Check size={18} color={themeColors.primary} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheetModal>
  );
}
