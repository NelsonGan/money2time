import {
  ANALYTICS_SAMPLE_RATE,
  AnalyticsEvents,
  getAnalyticsSampleFraction,
  isUserInAnalyticsSample,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
} from '~/services/analytics.shared';

describe('analytics cohort sampling', () => {
  it('keeps a user in the same cohort', () => {
    const userId = 'm2t_01234567-89ab-cdef-0123-456789abcdef';

    expect(getAnalyticsSampleFraction(userId)).toBe(getAnalyticsSampleFraction(userId));
    expect(isUserInAnalyticsSample(userId)).toBe(isUserInAnalyticsSample(userId));
    expect(isUserInAnalyticsSample(`  ${userId}  `)).toBe(isUserInAnalyticsSample(userId));
  });

  it('selects approximately half of a large deterministic population', () => {
    const populationSize = 10_000;
    const included = Array.from(
      { length: populationSize },
      (_, index) => `m2t_test_${index}`,
    ).filter((id) => isUserInAnalyticsSample(id)).length;

    expect(included / populationSize).toBeGreaterThan(0.48);
    expect(included / populationSize).toBeLessThan(0.52);
    expect(ANALYTICS_SAMPLE_RATE).toBe(0.5);
  });

  it('handles explicit rate boundaries', () => {
    expect(isUserInAnalyticsSample('m2t_test', 0)).toBe(false);
    expect(isUserInAnalyticsSample('m2t_test', Number.NaN)).toBe(false);
    expect(isUserInAnalyticsSample('m2t_test', 1)).toBe(true);
    expect(isUserInAnalyticsSample('', 1)).toBe(false);
  });
});

describe('GA4 analytics mapping', () => {
  it('maps every product event to a unique valid GA4 custom event name', () => {
    const names = Object.values(AnalyticsEvents).map(toGa4EventName);

    expect(new Set(names).size).toBe(names.length);
    names.forEach((name) => {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(name.length).toBeLessThanOrEqual(40);
      expect(name.startsWith('m2t_')).toBe(true);
    });
  });

  it('normalizes event values and enforces GA4 limits', () => {
    const longValue = 'x'.repeat(120);
    const manyProperties = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`Property ${index}`, index]),
    );
    const parameters = toGa4EventParameters({
      Enabled: true,
      Disabled: false,
      itemCount: 3,
      Missing: undefined,
      Empty: null,
      Long: longValue,
      ...manyProperties,
    });

    expect(parameters.enabled).toBe(1);
    expect(parameters.disabled).toBe(0);
    expect(parameters.item_count).toBe(3);
    expect(parameters).not.toHaveProperty('missing');
    expect(parameters).not.toHaveProperty('empty');
    expect(parameters.long).toBe('x'.repeat(100));
    expect(Object.keys(parameters)).toHaveLength(25);
    Object.keys(parameters).forEach((name) => expect(name.length).toBeLessThanOrEqual(40));
  });

  it('omits Mixpanel sampling metadata from unsampled GA4 data', () => {
    expect(toGa4EventParameters({ sample_rate: 0.5, type: 'debit' })).toEqual({
      type: 'debit',
    });
    expect(toGa4UserProperties({ sample_rate: 0.5, plan: 'annual' })).toEqual({
      plan: 'annual',
    });
  });

  it('converts profile values to bounded GA4 strings', () => {
    const properties = toGa4UserProperties({
      IsPro: true,
      Plan: 'annual',
      '123 invalid property name that is too long': 'y'.repeat(50),
      Missing: null,
    });

    expect(properties.is_pro).toBe('true');
    expect(properties.plan).toBe('annual');
    expect(properties).not.toHaveProperty('missing');
    Object.entries(properties).forEach(([name, value]) => {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(name.length).toBeLessThanOrEqual(24);
      expect(value.length).toBeLessThanOrEqual(36);
    });
  });
});
