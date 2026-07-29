import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { usePendingClaimCount } from '~/features/transactions/lib/useReimbursements';

/**
 * Amber count badge for the Settings "Reimbursements" tile. Isolated in its own
 * component so the transaction-derived count re-renders only this badge, not the
 * whole (mounted) Settings screen; uses the cheap count-only selector so a write
 * anywhere doesn't run the full per-payer roll-up just for this number.
 *
 * Amber rather than the Settle Up tile's red: an open claim is money you are
 * waiting on, not a debt anyone is late paying.
 */
export function ReimbursementsTileBadge() {
  const claimCount = usePendingClaimCount();
  if (claimCount <= 0) return null;
  return (
    <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warning px-1">
      <Text className="text-white text-[10px] font-bold leading-[13px]">{claimCount}</Text>
    </View>
  );
}
