import { SlidersHorizontal } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';

export function FilterIconButton({ onPress, count = 0 }: { onPress: () => void; count?: number }) {
  const themeColors = useThemeColors();
  const visibleCount = Math.min(99, Math.max(0, Math.floor(count)));

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="h-10 w-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/8 shadow-soft active:scale-95"
    >
      <SlidersHorizontal size={15} color={themeColors.primary} strokeWidth={2.2} />
      {visibleCount > 0 ? (
        <View className="absolute -right-1.5 -top-1.5 min-w-[20px] h-[20px] rounded-full bg-destructive px-1.5 items-center justify-center shadow-sm">
          <Text variant="label" className="text-white text-[10px]">
            {visibleCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
