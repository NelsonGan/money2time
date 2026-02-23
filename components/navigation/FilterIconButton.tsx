import React from 'react';
import { Pressable, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
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
      className="h-10 w-10 items-center justify-center rounded-full border border-primary/45 bg-primary/10 active:opacity-85"
    >
      <SlidersHorizontal size={15} color={themeColors.primary} />
      {visibleCount > 0 ? (
        <View className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-destructive px-1.5 py-[1px] items-center justify-center">
          <Text variant="label" className="text-white">
            {visibleCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
