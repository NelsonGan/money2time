import { useCallback } from 'react';
import { Alert } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { usePro } from '~/context/ProContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { requestOpenPaywall } from '~/services/paywallNavigation';

type LimitType = 'accounts' | 'categories' | 'recurring' | 'wage_entries';

const LIMIT_MAP: Record<LimitType, number> = {
  accounts: PRO_LIMITS.FREE_MAX_ACCOUNTS,
  categories: PRO_LIMITS.FREE_MAX_CATEGORIES,
  recurring: PRO_LIMITS.FREE_MAX_RECURRING_RULES,
  wage_entries: PRO_LIMITS.FREE_MAX_WAGE_ENTRIES,
};

export function useProGate() {
  const { isPro } = usePro();

  const checkLimit = useCallback(
    (type: LimitType, currentCount: number): boolean => {
      if (isPro) return true;
      const limit = LIMIT_MAP[type];
      if (currentCount < limit) return true;

      void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type });

      const messageKey = `pro.limit_${type}` as const;
      Alert.alert(I18n.t('pro.limit_reached_title'), I18n.t(messageKey, { count: limit }), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('pro.upgrade'),
          onPress: () => requestOpenPaywall(type),
        },
      ]);
      return false;
    },
    [isPro],
  );

  return { isPro, checkLimit };
}
