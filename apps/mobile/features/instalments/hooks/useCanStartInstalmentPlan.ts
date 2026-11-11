import { useCallback } from 'react';

import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';

/**
 * Asked before a new instalment plan is started, from the add form, a saved
 * expense or the plans page: true when the free plan has room for another
 * plan still being paid, otherwise false with the paywall shown.
 */
export function useCanStartInstalmentPlan(): () => boolean {
  const { instalmentPlans } = useApp();
  const { checkLimit } = useProGate();
  return useCallback(
    () => checkLimit('instalments', instalmentPlans.filter((plan) => !plan.complete).length),
    [checkLimit, instalmentPlans],
  );
}
