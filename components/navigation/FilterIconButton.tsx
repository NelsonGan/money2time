import React from 'react';
import { Pressable, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { triggerHaptic } from '~/services/haptics';

export function FilterIconButton({ onPress, count = 0 }: { onPress: () => void; count?: number }) {
  const visibleCount = Math.min(99, Math.max(0, Math.floor(count)));

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card active:scale-95"
    >
      <ClayIcon name="ui/filter-sliders" size={26} />
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
