import {
  AnalyticsEvents,
  claimDailyAppOpen,
  claimDailyFeature,
  claimDailyTransaction,
  daysBetween,
  daysSinceInstall,
  EMPTY_DAILY_STATE,
  EMPTY_USAGE_STATE,
  featureUsedBy,
  featureViewedOn,
  GA4_ONLY_EVENTS,
  isPostHogEvent,
  localDayKey,
  parseDailyState,
  parseUsageState,
  POSTHOG_EVENTS,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
} from '~/services/analytics.shared';

describe('analytics event routing', () => {
  it('routes each RiceCal ad click to both providers without marking feature adoption', () => {
    const event = AnalyticsEvents.RICECAL_AD_CLICKED;
    expect(isPostHogEvent(event)).toBe(true);
    expect(toGa4EventName(event)).toBe('m2t_rice_cal_ad_clicked');
    expect(featureUsedBy(event, { source: 'settings' })).toBeNull();
  });

  it('places every event in exactly one destination group', () => {
    const postHogKeys = Object.keys(POSTHOG_EVENTS);
    const ga4OnlyKeys = new Set(Object.keys(GA4_ONLY_EVENTS));
    // A key in both groups would be silently overwritten by the spread that
    // builds AnalyticsEvents, and the event would lose its routing decision.
    expect(postHogKeys.filter((key) => ga4OnlyKeys.has(key))).toEqual([]);

    const names = Object.values(AnalyticsEvents);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(postHogKeys.length + ga4OnlyKeys.size);
  });

  it('sends PostHog only the PostHog group', () => {
    Object.values(POSTHOG_EVENTS).forEach((name) => expect(isPostHogEvent(name)).toBe(true));
    Object.values(GA4_ONLY_EVENTS).forEach((name) => expect(isPostHogEvent(name)).toBe(false));
  });

  it('keeps the whole path to a purchase in PostHog', () => {
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
    ].forEach((name) => expect(isPostHogEvent(name)).toBe(true));
  });

  it('sends PostHog daily engagement and milestones, and frequent per-use events to GA4 only', () => {
    [
      AnalyticsEvents.DAILY_APP_OPEN,
      AnalyticsEvents.DAILY_TRANSACTION_LOGGED,
      AnalyticsEvents.FEATURE_USED,
      AnalyticsEvents.FEATURE_FIRST_USED,
      AnalyticsEvents.TRANSACTION_MILESTONE_REACHED,
      AnalyticsEvents.DATA_RESET,
    ].forEach((name) => expect(isPostHogEvent(name)).toBe(true));
    [
      AnalyticsEvents.VOICE_TRANSACTION_CREATED,
      AnalyticsEvents.AUTOLOG_TRANSACTION_CREATED,
      AnalyticsEvents.WIDGET_OPENED,
      AnalyticsEvents.TRANSACTION_DELETED,
      AnalyticsEvents.AUTO_BACKUP_RESTORED,
    ].forEach((name) => expect(isPostHogEvent(name)).toBe(false));
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

describe('featureUsedBy', () => {
  it('maps a feature to the event that marks a real use of it', () => {
    expect(featureUsedBy(AnalyticsEvents.RECEIPT_SCAN_COMPLETED)).toBe('receipt_scan');
    expect(featureUsedBy(AnalyticsEvents.SPLIT_BILL_CREATED, { people: 2 })).toBe('split_bill');
    expect(featureUsedBy(AnalyticsEvents.ITEM_CREATED)).toBe('items');
    expect(featureUsedBy(AnalyticsEvents.GOAL_UPDATED)).toBeNull();
    expect(featureUsedBy(AnalyticsEvents.RECEIPT_SCAN_FAILED, { code: 'network' })).toBeNull();
  });

  it('counts a two-way event only in the direction that is a use', () => {
    expect(featureUsedBy(AnalyticsEvents.DISPLAY_MODE_TOGGLED, { mode: 'time' })).toBe(
      'time_display',
    );
    expect(featureUsedBy(AnalyticsEvents.DISPLAY_MODE_TOGGLED, { mode: 'money' })).toBeNull();
    expect(featureUsedBy(AnalyticsEvents.REIMBURSEMENT_FLAGGED, { reimbursable: true })).toBe(
      'reimbursements',
    );
    expect(
      featureUsedBy(AnalyticsEvents.REIMBURSEMENT_FLAGGED, { reimbursable: false }),
    ).toBeNull();
    expect(featureUsedBy(AnalyticsEvents.WIDGET_OPENED, { widget: 'budget' })).toBe('widget');
    // The live-earnings reminder notification, not a widget.
    expect(
      featureUsedBy(AnalyticsEvents.WIDGET_OPENED, { widget: 'live_earnings', source: 'schedule' }),
    ).toBeNull();
  });

  it('never reads a use from the engagement events that report uses', () => {
    // `Feature Used` reporting itself as a use would loop.
    [
      AnalyticsEvents.FEATURE_FIRST_USED,
      AnalyticsEvents.FEATURE_USED,
      AnalyticsEvents.DAILY_APP_OPEN,
      AnalyticsEvents.DAILY_TRANSACTION_LOGGED,
      AnalyticsEvents.TRANSACTION_MILESTONE_REACHED,
    ].forEach((name) => expect(featureUsedBy(name, { feature: 'goals' })).toBeNull());
  });

  it('counts only Insights among screens as a daily feature use', () => {
    expect(featureViewedOn('insights')).toBe('insights');
    ['calendar', 'albums', 'accounts', 'settings', null, undefined].forEach((screen) =>
      expect(featureViewedOn(screen)).toBeNull(),
    );
  });
});

describe('parseUsageState', () => {
  it('reads back a stored state', () => {
    const state = { fromInstall: true, features: ['goals', 'widget'], loggedTransactions: 12 };
    expect(parseUsageState(JSON.stringify(state))).toEqual(state);
  });

  it('falls back to the empty state, which reports nothing, when unreadable', () => {
    [null, '', 'not json', '42', 'null'].forEach((raw) =>
      expect(parseUsageState(raw)).toEqual(EMPTY_USAGE_STATE),
    );
    expect(EMPTY_USAGE_STATE.fromInstall).toBe(false);
  });

  it('drops features it does not know and counts it cannot use', () => {
    expect(
      parseUsageState(
        JSON.stringify({
          fromInstall: 'yes',
          features: ['goals', 'retired_feature', 7],
          loggedTransactions: -3,
        }),
      ),
    ).toEqual({ fromInstall: false, features: ['goals'], loggedTransactions: 0 });
    expect(
      parseUsageState(JSON.stringify({ fromInstall: true, loggedTransactions: 12.7 })),
    ).toEqual({ fromInstall: true, features: [], loggedTransactions: 12 });
  });
});

describe('daily engagement state', () => {
  it('formats the device-local day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('counts calendar days between two day keys', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween(null, '2026-10-01')).toBeNull();
    expect(daysBetween('garbage', '2026-10-01')).toBeNull();
  });

  it('claims one app open per day and counts active days across days', () => {
    const [first, firstClaim] = claimDailyAppOpen(EMPTY_DAILY_STATE, '2026-10-01');
    expect(firstClaim).toEqual({ active_days: 1, days_since_last_active: null });
    const [same, sameClaim] = claimDailyAppOpen(first, '2026-10-01');
    expect(sameClaim).toBeNull();
    expect(same).toBe(first);
    const [, nextClaim] = claimDailyAppOpen(same, '2026-10-04');
    expect(nextClaim).toEqual({ active_days: 2, days_since_last_active: 3 });
  });

  it('claims one logged transaction per day and counts logging days', () => {
    const [first, claim] = claimDailyTransaction(EMPTY_DAILY_STATE, '2026-10-01');
    expect(claim).toEqual({ logging_days: 1 });
    expect(claimDailyTransaction(first, '2026-10-01')[1]).toBeNull();
    expect(claimDailyTransaction(first, '2026-10-02')[1]).toEqual({ logging_days: 2 });
  });

  it('claims each feature once per day, independently of the others', () => {
    const [afterGoals, goals] = claimDailyFeature(EMPTY_DAILY_STATE, '2026-10-01', 'goals');
    expect(goals).toBe(true);
    expect(claimDailyFeature(afterGoals, '2026-10-01', 'goals')[1]).toBe(false);
    expect(claimDailyFeature(afterGoals, '2026-10-01', 'insights')[1]).toBe(true);
    expect(claimDailyFeature(afterGoals, '2026-10-02', 'goals')[1]).toBe(true);
  });

  it("a new day clears today's claims but keeps the lifetime counters", () => {
    const [opened] = claimDailyAppOpen(EMPTY_DAILY_STATE, '2026-10-01');
    const [logged] = claimDailyTransaction(opened, '2026-10-01');
    const [next] = claimDailyFeature(logged, '2026-10-02', 'goals');
    expect(next).toEqual({
      day: '2026-10-02',
      opened: false,
      transactionLogged: false,
      features: ['goals'],
      activeDays: 1,
      loggingDays: 1,
      lastActiveDay: '2026-10-01',
    });
  });

  it('reads back a stored state and falls back to a fresh one when unreadable', () => {
    const [state] = claimDailyAppOpen(EMPTY_DAILY_STATE, '2026-10-01');
    expect(parseDailyState(JSON.stringify(state))).toEqual(state);
    [null, '', 'not json', '42'].forEach((raw) =>
      expect(parseDailyState(raw)).toEqual(EMPTY_DAILY_STATE),
    );
    expect(
      parseDailyState(JSON.stringify({ day: 'yesterday', activeDays: -2, opened: 'yes' })),
    ).toEqual(EMPTY_DAILY_STATE);
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

  it('never truncates an event name to fit the GA4 limit', () => {
    // Truncation is silent, so a long name would reach GA4 cut mid-word.
    Object.values(AnalyticsEvents).forEach((name) =>
      expect(toGa4EventName(name)).toBe(
        `m2t_${name
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .toLowerCase()
          .replace(/ /g, '_')}`,
      ),
    );
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
