import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useUnpaidPersonCount } from '~/features/transactions/lib/useSettleUpSummary';

/**
 * Red count badge for the Settings "Who owes you" tile. Isolated in its own
 * component so the transaction-derived count re-renders only this badge, not
 * the whole (mounted) Settings screen; uses the cheap count-only selector so a
 * write anywhere doesn't run the full per-person roll-up just for this number.
 */
export function SettleUpTileBadge() {
  const personCount = useUnpaidPersonCount();
  if (personCount <= 0) return null;
  return (
    <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive items-center justify-center">
      <Text className="text-white text-[10px] font-bold leading-[13px]">{personCount}</Text>
    </View>
  );
}
