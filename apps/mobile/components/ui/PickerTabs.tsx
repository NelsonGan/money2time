import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

interface PickerTabsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * The underlined tab row under a picker sheet's title (Library / Custom and the
 * like). It sits on its own row so it doesn't compete with the centered title
 * for the header's side slots.
 */
export function PickerTabs<T extends string>({ options, value, onChange }: PickerTabsProps<T>) {
  const themeColors = useThemeColors();
  return (
    <View className="flex-row px-5 pb-3" style={{ gap: spacing.lg }}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              void triggerHaptic('selection');
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              variant="bodyStrong"
              className={cn(active ? 'text-primary' : 'text-muted-foreground')}
            >
              {option.label}
            </Text>
            <View
              className="h-0.5 mt-1 rounded-full"
              style={{ backgroundColor: active ? themeColors.primary : 'transparent' }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
