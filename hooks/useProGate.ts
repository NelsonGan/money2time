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
  | 'custom_subscription_logos'
  | 'subcurrencies'
  | 'albums'
  | 'items'
  | 'budget_templates'
  | 'receipts'
  | 'split_bills'
  | 'goals'
  | 'loans';

const LIMIT_MAP: Record<LimitType, number> = {
  accounts: PRO_LIMITS.FREE_MAX_ACCOUNTS,
  categories: PRO_LIMITS.FREE_MAX_CATEGORIES,
  recurring: PRO_LIMITS.FREE_MAX_RECURRING_RULES,
  wage_entries: PRO_LIMITS.FREE_MAX_WAGE_ENTRIES,
  custom_logos: PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS,
  custom_item_images: PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS,
  // Its own allowance rather than a share of custom_logos: that key counts the
  // account-logo library, and reusing it here would gate one pool on the other
  // pool's size.
  custom_subscription_logos: PRO_LIMITS.FREE_MAX_CUSTOM_LOGOS,
  subcurrencies: PRO_LIMITS.FREE_MAX_SUBCURRENCIES,
  albums: PRO_LIMITS.FREE_MAX_ALBUMS,
  items: PRO_LIMITS.FREE_MAX_ITEMS,
  budget_templates: PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES,
  receipts: PRO_LIMITS.FREE_MAX_RECEIPTS,
  split_bills: PRO_LIMITS.FREE_MAX_UNSETTLED_SPLIT_BILLS,
  goals: PRO_LIMITS.FREE_MAX_SAVINGS_GOALS,
  loans: PRO_LIMITS.FREE_MAX_LOANS,
};

/**
 * Features with no free allowance at all, gated by {@link useProGate.requirePro}
 * rather than by a count. Kept separate from LimitType because there is no
 * number to put in LIMIT_MAP: zero is not a limit the user can approach.
 */
type ProOnlyFeature = 'app_icon' | 'custom_category_icons' | 'icon_packs' | 'reimbursements';

export function useProGate() {
  const { isPro } = usePro();

  /**
   * Hard Pro gate. Opens the paywall and returns false for a free user, with no
   * free allowance first. Use for features that are Pro from the first use;
   * use {@link checkLimit} when free users get N of something.
   */
  const requirePro = useCallback(
    (feature: ProOnlyFeature): boolean => {
      if (isPro) return true;
      void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: feature });
      requestOpenPaywall(feature, I18n.t(`pro.limit_${feature}`));
      return false;
    },
    [isPro],
  );

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

  return { isPro, checkLimit, requirePro };
}
