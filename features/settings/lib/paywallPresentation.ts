import type { RevenueCatFreeTrial } from '~/services/revenueCat';

export type PaywallPlanKind = 'monthly' | 'annual' | 'lifetime';

export interface PaywallPresentationPlan {
  id: string;
  kind: PaywallPlanKind;
  priceLabel: string | null;
  freeTrial: RevenueCatFreeTrial | null;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface PaywallPlanPresentation {
  trialDurationLabel: string | null;
  trialBadgeLabel: string | null;
  heroTitle: string;
  ctaLabel: string;
  detailLabel: string;
}

function getTrialPlurality(count: number, locale: string) {
  const language = locale.split('-')[0];
  if (language === 'pl' || language === 'ru' || language === 'uk') {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (
      (language === 'pl' && count === 1) ||
      (language !== 'pl' && lastDigit === 1 && lastTwoDigits !== 11)
    ) {
      return 'one';
    }
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
      return 'few';
    }
    return 'many';
  }
  return count === 1 ? 'one' : 'other';
}

function formatTrialDuration(trial: RevenueCatFreeTrial, translate: Translate, locale: string) {
  const plurality = getTrialPlurality(trial.durationCount, locale);
  return translate(`pro.trial_duration_${trial.durationUnit}_${plurality}`, {
    count: trial.durationCount,
  });
}

export function buildPaywallPlanPresentation(
  plan: PaywallPresentationPlan,
  translate: Translate,
  locale = 'en',
): PaywallPlanPresentation {
  if (!plan.freeTrial || !plan.priceLabel?.trim()) {
    return {
      trialDurationLabel: null,
      trialBadgeLabel: null,
      heroTitle: translate('pro.hero_title'),
      ctaLabel: translate(plan.kind === 'lifetime' ? 'pro.buy_lifetime' : 'pro.subscribe'),
      detailLabel: plan.priceLabel?.trim()
        ? `${plan.priceLabel}. ${translate(plan.kind === 'lifetime' ? 'pro.lifetime_desc' : 'pro.no_commitment')}`
        : translate(plan.kind === 'lifetime' ? 'pro.lifetime_desc' : 'pro.no_commitment'),
    };
  }

  const duration = formatTrialDuration(plan.freeTrial, translate, locale);
  return {
    trialDurationLabel: duration,
    trialBadgeLabel: translate('pro.trial_free', { duration }),
    heroTitle: translate('pro.hero_title'),
    ctaLabel: translate('pro.trial_cta'),
    detailLabel: translate('pro.trial_terms', {
      duration,
      price: plan.priceLabel,
    }),
  };
}

export function getDefaultPaywallPlanId(plans: readonly PaywallPresentationPlan[]) {
  return (
    plans.find((plan) => plan.kind === 'annual' && plan.freeTrial && plan.priceLabel?.trim())?.id ??
    plans.find((plan) => plan.freeTrial && plan.priceLabel?.trim())?.id ??
    plans.find((plan) => plan.kind === 'annual')?.id ??
    plans.find((plan) => plan.kind === 'monthly')?.id ??
    plans[0]?.id ??
    null
  );
}

/** Keep an explicit choice through the placeholder-to-store package transition. */
export function resolveSelectedPaywallPlan<T extends PaywallPresentationPlan>(
  plans: readonly T[],
  selected: Pick<PaywallPresentationPlan, 'id' | 'kind'> | null,
): T | null {
  const defaultId = getDefaultPaywallPlanId(plans);
  return (
    plans.find((plan) => plan.id === selected?.id) ??
    (selected ? plans.find((plan) => plan.kind === selected.kind) : undefined) ??
    plans.find((plan) => plan.id === defaultId) ??
    null
  );
}
