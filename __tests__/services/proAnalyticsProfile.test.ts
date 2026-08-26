import { buildProAnalyticsProfile, resolveProPlan } from '~/services/analytics.shared';

describe('resolveProPlan', () => {
  it('reports free when the entitlement is not active, whatever the product id says', () => {
    expect(resolveProPlan(false, 'm2t_lifetime')).toBe('free');
    expect(resolveProPlan(false, null)).toBe('free');
  });

  it('maps the shipping SKUs, case- and suffix-insensitively', () => {
    expect(resolveProPlan(true, 'm2t_lifetime')).toBe('lifetime');
    expect(resolveProPlan(true, 'M2T_Annual_SG')).toBe('annual');
    expect(resolveProPlan(true, 'm2t_pro_1year')).toBe('annual');
    expect(resolveProPlan(true, 'm2t_monthly_intro')).toBe('monthly');
  });

  it('keeps an unrecognised active product on the Pro side of the fence', () => {
    expect(resolveProPlan(true, 'promo_grant_2026')).toBe('other');
    expect(resolveProPlan(true, null)).toBe('other');
  });
});

describe('buildProAnalyticsProfile', () => {
  it('always writes the fields that must be current, even for a free user', () => {
    const { userProperties, superProperties } = buildProAnalyticsProfile({ isPro: false });

    expect(userProperties).toEqual({ is_pro: false, pro_plan: 'free', pro_renewing: false });
    expect(superProperties).toEqual({ is_pro: false, pro_plan: 'free' });
  });

  it('carries the plan detail for an active subscriber', () => {
    const { userProperties } = buildProAnalyticsProfile({
      isPro: true,
      activatedAt: '2026-01-05T00:00:00Z',
      activeProductIdentifier: 'm2t_annual',
      expirationDate: '2027-01-05T00:00:00Z',
      hasRenewingSubscription: true,
    });

    expect(userProperties).toEqual({
      is_pro: true,
      pro_plan: 'annual',
      pro_renewing: true,
      pro_product_id: 'm2t_annual',
      pro_since: '2026-01-05T00:00:00Z',
      pro_expires_at: '2027-01-05T00:00:00Z',
    });
  });

  it('omits the expiry for lifetime rather than inventing one', () => {
    const { userProperties } = buildProAnalyticsProfile({
      isPro: true,
      activeProductIdentifier: 'm2t_lifetime',
      expirationDate: null,
      hasRenewingSubscription: false,
    });

    expect(userProperties.pro_plan).toBe('lifetime');
    expect(userProperties).not.toHaveProperty('pro_expires_at');
  });

  it('gives an identical signature for identical state, so a resume re-sends nothing', () => {
    const source = {
      isPro: true,
      activatedAt: '2026-01-05T00:00:00Z',
      activeProductIdentifier: 'm2t_monthly',
      expirationDate: '2026-02-05T00:00:00Z',
      hasRenewingSubscription: true,
    };

    expect(buildProAnalyticsProfile(source).signature).toBe(
      buildProAnalyticsProfile({ ...source }).signature,
    );
  });

  it('changes the signature the moment Pro lapses', () => {
    const active = buildProAnalyticsProfile({
      isPro: true,
      activeProductIdentifier: 'm2t_monthly',
      expirationDate: '2026-02-05T00:00:00Z',
      hasRenewingSubscription: true,
    });
    const lapsed = buildProAnalyticsProfile({
      isPro: false,
      activeProductIdentifier: 'm2t_monthly',
      expirationDate: '2026-02-05T00:00:00Z',
      hasRenewingSubscription: false,
    });

    expect(lapsed.signature).not.toBe(active.signature);
    // The lapsed profile keeps the history on purpose: what they last held and
    // when it ran out is the churn signal.
    expect(lapsed.userProperties.pro_product_id).toBe('m2t_monthly');
    expect(lapsed.userProperties.pro_plan).toBe('free');
  });
});
