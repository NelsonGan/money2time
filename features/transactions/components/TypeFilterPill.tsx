import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

interface TypeFilterPillProps<T extends string> {
  label: string;
  value: T;
  selected: boolean;
  onSelect: (value: T) => void;
}

export function TypeFilterPill<T extends string>({
  label,
  value,
  selected,
  onSelect,
}: TypeFilterPillProps<T>) {
  const themeColors = useThemeColors();
  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onSelect(value);
  }, [onSelect, value]);

  return (
    <Pressable
      onPress={handlePress}
      className={cn(
        'rounded-pill border px-4 py-2 flex-row items-center gap-1.5 active:scale-95',
        selected ? 'border-primary/40 bg-primary/12 shadow-glow' : 'border-border/30 bg-card',
      )}
    >
      {/* Active indicator dot */}
      {selected ? (
        <View
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: themeColors.primary }}
        />
      ) : null}
      <Text variant="caption" className={cn(selected ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}
