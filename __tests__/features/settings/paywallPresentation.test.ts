import {
  buildPaywallPlanPresentation,
  getDefaultPaywallPlanId,
  type PaywallPresentationPlan,
} from '~/features/settings/lib/paywallPresentation';

function translate(key: string, params?: Record<string, string | number>) {
  const suffix = params
    ? `:${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : '';
  return `${key}${suffix}`;
}

function plan(overrides: Partial<PaywallPresentationPlan>): PaywallPresentationPlan {
  return {
    id: 'monthly',
    kind: 'monthly',
    priceLabel: '$4.99',
    freeTrial: null,
    ...overrides,
  };
}

describe('paywall presentation', () => {
  it.each([
    ['day', 1, 'pro.trial_duration_day_one:count=1'],
    ['day', 7, 'pro.trial_duration_day_other:count=7'],
    ['week', 1, 'pro.trial_duration_week_one:count=1'],
    ['week', 2, 'pro.trial_duration_week_other:count=2'],
    ['month', 1, 'pro.trial_duration_month_one:count=1'],
    ['month', 3, 'pro.trial_duration_month_other:count=3'],
    ['year', 1, 'pro.trial_duration_year_one:count=1'],
    ['year', 2, 'pro.trial_duration_year_other:count=2'],
  ] as const)('formats a %s trial of %s unit(s)', (durationUnit, durationCount, expected) => {
    const presentation = buildPaywallPlanPresentation(
      plan({
        kind: 'annual',
        priceLabel: '$24.99',
        freeTrial: { durationIso8601: 'ignored', durationCount, durationUnit },
      }),
      translate,
    );

    expect(presentation.trialDurationLabel).toBe(expected);
  });

  it('uses duration-aware trial copy only when the selected package has a free trial', () => {
    const presentation = buildPaywallPlanPresentation(
      plan({
        kind: 'annual',
        priceLabel: '$24.99',
        freeTrial: { durationIso8601: 'P1W', durationCount: 1, durationUnit: 'week' },
      }),
      translate,
    );

    expect(presentation).toMatchObject({
      trialDurationLabel: 'pro.trial_duration_week_one:count=1',
      trialBadgeLabel: 'pro.trial_free:duration=pro.trial_duration_week_one:count=1',
      heroTitle: 'pro.trial_hero_title:duration=pro.trial_duration_week_one:count=1',
      ctaLabel: 'pro.trial_cta:duration=pro.trial_duration_week_one:count=1',
      detailLabel: 'pro.trial_terms:duration=pro.trial_duration_week_one:count=1,price=$24.99',
    });
  });

  it.each([
    ['monthly', 'pro.no_commitment'],
    ['annual', 'pro.no_commitment'],
    ['lifetime', 'pro.lifetime_desc'],
  ] as const)('uses ordinary %s purchase copy when no trial is available', (kind, detailLabel) => {
    expect(buildPaywallPlanPresentation(plan({ kind, freeTrial: null }), translate)).toMatchObject({
      trialDurationLabel: null,
      trialBadgeLabel: null,
      heroTitle: 'pro.hero_title',
      ctaLabel: 'pro.exit_cta',
      detailLabel,
    });
  });

  it('prefers an annual trial, then another trial, then the annual plan', () => {
    const monthlyTrial = plan({
      id: 'monthly-trial',
      freeTrial: { durationIso8601: 'P3D', durationCount: 3, durationUnit: 'day' },
    });
    const annual = plan({ id: 'annual', kind: 'annual' });
    const annualTrial = plan({
      id: 'annual-trial',
      kind: 'annual',
      freeTrial: { durationIso8601: 'P1W', durationCount: 1, durationUnit: 'week' },
    });

    expect(getDefaultPaywallPlanId([monthlyTrial, annual, annualTrial])).toBe('annual-trial');
    expect(getDefaultPaywallPlanId([monthlyTrial, annual])).toBe('monthly-trial');
    expect(getDefaultPaywallPlanId([annual, plan({ id: 'monthly' })])).toBe('annual');
    expect(getDefaultPaywallPlanId([])).toBeNull();
  });
});
