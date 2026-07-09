import { useCallback } from 'react';

import { PRO_LIMITS } from '~/constants/proLimits';
import { usePro } from '~/context/ProContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { requestOpenPaywall } from '~/services/paywallNavigation';

type LimitType =
  | 'accounts'
  | 'categories'
  | 'recurring'
  | 'wage_entries'
  | 'custom_logos'
  | 'custom_item_images'
  | 'subcurrencies'
  | 'albums'
  | 'items'
  | 'budget_templates'
  | 'receipts';

const LIMIT_MAP: Record<LimitType, number> = {
  accounts: PRO_LIMITS.FREE_MAX_ACCOUNTS,
  categories: PRO_LIMITS.FREE_MAX_CATEGORIES,
  recurring: PRO_LIMITS.FREE_MAX_RECURRING_RULES,
  wage_entries: PRO_LIMITS.FREE_MAX_WAGE_ENTRIES,
  custom_logos: PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS,
  custom_item_images: PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS,
  subcurrencies: PRO_LIMITS.FREE_MAX_SUBCURRENCIES,
  albums: PRO_LIMITS.FREE_MAX_ALBUMS,
  items: PRO_LIMITS.FREE_MAX_ITEMS,
  budget_templates: PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES,
  receipts: PRO_LIMITS.FREE_MAX_RECEIPTS,
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
      requestOpenPaywall(type, I18n.t(messageKey, { count: limit }));
      return false;
    },
    [isPro],
  );

  return { isPro, checkLimit };
}
