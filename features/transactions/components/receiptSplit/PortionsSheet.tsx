import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export interface PortionRow {
  personId: string;
  label: string;
  weight: number;
}

interface PortionsSheetProps {
  visible: boolean;
  itemName: string;
  rows: PortionRow[];
  onChangeWeight: (personId: string, weight: number) => void;
  onClose: () => void;
}

/**
 * Bottom sheet for uneven shares of one item: an integer portion stepper per
 * sharer ("Bob 2, Me 1" for 2-of-3 beers). Weight 0 removes the person from
 * the item when the sheet closes.
 */
export function PortionsSheet({
  visible,
  itemName,
  rows,
  onChangeWeight,
  onClose,
}: PortionsSheetProps) {
  const themeColors = useThemeColors();
  const { bottom } = useSafeAreaInsets();

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-t-[28px] bg-background px-5 pt-5"
          style={{ paddingBottom: Math.max(bottom, 16) }}
          onPress={(event) => event.stopPropagation()}
        >
          <Text variant="headingSm" numberOfLines={1}>
            {I18n.t('transactions.receiptSplit.portions_title')}
          </Text>
          <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
            {itemName}
          </Text>
          <View className="mt-4 gap-2">
            {rows.map((row) => (
              <View
                key={row.personId}
                className="flex-row items-center justify-between rounded-2xl bg-secondary/50 px-4 py-3"
              >
                <Text variant="body" className="flex-1 pr-3" numberOfLines={1}>
                  {row.label}
                </Text>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
                    onPress={() => {
                      void triggerHaptic('selection');
                      onChangeWeight(row.personId, Math.max(0, row.weight - 1));
                    }}
                  >
                    <Minus size={16} color={themeColors.text} />
                  </Pressable>
                  <Text variant="bodyStrong" className="w-6 text-center">
                    {row.weight}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
                    onPress={() => {
                      void triggerHaptic('selection');
                      onChangeWeight(row.personId, row.weight + 1);
                    }}
                  >
                    <Plus size={16} color={themeColors.text} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            className="mt-4 h-12 items-center justify-center rounded-full bg-primary"
            onPress={onClose}
          >
            <Text variant="bodyStrong" className="text-primary-foreground">
              {I18n.t('common.done')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
