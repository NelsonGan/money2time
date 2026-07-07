import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';

/**
 * Red count badge for the Settings "Who owes you" tile. Isolated in its own
 * component so the transaction-derived count re-renders only this badge, not
 * the whole (mounted) Settings screen.
 */
export function SettleUpTileBadge() {
  const { personCount } = useSettleUpSummary();
  if (personCount <= 0) return null;
  return (
    <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive items-center justify-center">
      <Text className="text-white text-[10px] font-bold leading-[13px]">{personCount}</Text>
    </View>
  );
}
