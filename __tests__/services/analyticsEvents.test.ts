import {
  AnalyticsEvents,
  daysSinceInstall,
  GA4_ONLY_EVENTS,
  isMixpanelEvent,
  MIXPANEL_EVENTS,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
} from '~/services/analytics.shared';

describe('analytics event routing', () => {
  it('places every event in exactly one destination group', () => {
    const mixpanelKeys = Object.keys(MIXPANEL_EVENTS);
    const ga4OnlyKeys = new Set(Object.keys(GA4_ONLY_EVENTS));
    // A key in both groups would be silently overwritten by the spread that
    // builds AnalyticsEvents, and the event would lose its routing decision.
    expect(mixpanelKeys.filter((key) => ga4OnlyKeys.has(key))).toEqual([]);

    const names = Object.values(AnalyticsEvents);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(mixpanelKeys.length + ga4OnlyKeys.size);
  });

  it('sends Mixpanel only the Mixpanel group', () => {
    Object.values(MIXPANEL_EVENTS).forEach((name) => expect(isMixpanelEvent(name)).toBe(true));
    Object.values(GA4_ONLY_EVENTS).forEach((name) => expect(isMixpanelEvent(name)).toBe(false));
  });

  it('keeps the whole path to a purchase in Mixpanel', () => {
    [
      AnalyticsEvents.FIRST_APP_OPEN,
      AnalyticsEvents.ONBOARDING_STARTED,
      AnalyticsEvents.ONBOARDING_COMPLETED,
      AnalyticsEvents.FIRST_TRANSACTION_CREATED,
      AnalyticsEvents.PRO_PAYWALL_VIEWED,
      AnalyticsEvents.PRO_PLANS_UNAVAILABLE,
      AnalyticsEvents.PRO_PURCHASE_STARTED,
      AnalyticsEvents.PRO_PURCHASE_COMPLETED,
      AnalyticsEvents.PRO_PURCHASE_PENDING,
      AnalyticsEvents.PRO_PURCHASE_CANCELLED,
      AnalyticsEvents.PRO_PURCHASE_FAILED,
      AnalyticsEvents.PRO_RESTORE_STARTED,
      AnalyticsEvents.PRO_RESTORE_COMPLETED,
      AnalyticsEvents.PRO_RESTORE_FAILED,
    ].forEach((name) => expect(isMixpanelEvent(name)).toBe(true));
  });

  it('never names an event like the SDK automatic events it replaces', () => {
    // The iOS SDK silently drops any `$ae_` event while automatic events are off.
    Object.values(AnalyticsEvents).forEach((name) => expect(name.startsWith('$')).toBe(false));
  });
});

describe('daysSinceInstall', () => {
  const installedAt = '2026-09-01T10:00:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('counts whole 24-hour periods since the install', () => {
    expect(daysSinceInstall(installedAt, at('2026-09-01T10:00:00.000Z'))).toBe(0);
    expect(daysSinceInstall(installedAt, at('2026-09-02T09:59:59.999Z'))).toBe(0);
    expect(daysSinceInstall(installedAt, at('2026-09-02T10:00:00.000Z'))).toBe(1);
    expect(daysSinceInstall(installedAt, at('2026-10-01T12:00:00.000Z'))).toBe(30);
  });

  it('reads a clock that moved behind the install as day 0', () => {
    expect(daysSinceInstall(installedAt, at('2026-08-30T10:00:00.000Z'))).toBe(0);
  });

  it('is null when the install date is missing or unreadable', () => {
    expect(daysSinceInstall(null)).toBeNull();
    expect(daysSinceInstall(undefined)).toBeNull();
    expect(daysSinceInstall('')).toBeNull();
    expect(daysSinceInstall('not a date')).toBeNull();
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
