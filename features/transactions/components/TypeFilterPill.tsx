import { useCallback } from 'react';
import { Pressable } from 'react-native';

import { Text } from '~/components/ui';
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
  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onSelect(value);
  }, [onSelect, value]);

  return (
    <Pressable
      onPress={handlePress}
      className={cn(
        'rounded-full border px-3.5 py-2 flex-row items-center gap-1 active:opacity-85',
        selected ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text variant="label" className={cn(selected ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}
