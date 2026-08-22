import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useTransactions } from '~/context/AppContext';
import { countPendingReimbursements } from '~/features/reimbursements/lib/reimbursementMath';

/**
 * Red count badge for the Settings "Claim back" tile, matching the one on
 * "Who owes you". Isolated in its own component so the transaction-derived
 * count re-renders only this badge and not the whole (permanently mounted)
 * Settings screen, and counts in a single pass so a write anywhere does not
 * run the full bucket-and-sort just for this number.
 */
export function ReimbursementTileBadge() {
  const { transactions } = useTransactions();
  const pendingCount = useMemo(() => countPendingReimbursements(transactions), [transactions]);
  if (pendingCount <= 0) return null;
  return (
    <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive items-center justify-center">
      <Text className="text-white text-[10px] font-bold leading-[13px]">{pendingCount}</Text>
    </View>
  );
}
