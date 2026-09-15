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

function formatTrialDuration(trial: RevenueCatFreeTrial, translate: Translate) {
  const plurality = trial.durationCount === 1 ? 'one' : 'other';
  return translate(`pro.trial_duration_${trial.durationUnit}_${plurality}`, {
    count: trial.durationCount,
  });
}

export function buildPaywallPlanPresentation(
  plan: PaywallPresentationPlan,
  translate: Translate,
): PaywallPlanPresentation {
  if (!plan.freeTrial) {
    return {
      trialDurationLabel: null,
      trialBadgeLabel: null,
      heroTitle: translate('pro.hero_title'),
      ctaLabel: translate('pro.exit_cta'),
      detailLabel: translate(plan.kind === 'lifetime' ? 'pro.lifetime_desc' : 'pro.no_commitment'),
    };
  }

  const duration = formatTrialDuration(plan.freeTrial, translate);
  return {
    trialDurationLabel: duration,
    trialBadgeLabel: translate('pro.trial_free', { duration }),
    heroTitle: translate('pro.trial_hero_title', { duration }),
    ctaLabel: translate('pro.trial_cta', { duration }),
    detailLabel: translate('pro.trial_terms', {
      duration,
      price: plan.priceLabel ?? '',
    }),
  };
}

export function getDefaultPaywallPlanId(plans: readonly PaywallPresentationPlan[]) {
  return (
    plans.find((plan) => plan.kind === 'annual' && plan.freeTrial)?.id ??
    plans.find((plan) => plan.freeTrial)?.id ??
    plans.find((plan) => plan.kind === 'annual')?.id ??
    plans.find((plan) => plan.kind === 'monthly')?.id ??
    plans[0]?.id ??
    null
  );
}
