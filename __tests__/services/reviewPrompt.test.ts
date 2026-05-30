import {
  checkEligibility,
  createInitialState,
  markPrompted,
  MIN_ACTIVE_DAYS,
  MIN_DAYS_BETWEEN_PROMPTS,
  MIN_DAYS_SINCE_INSTALL,
  MIN_DAYS_SINCE_VERSION_CHANGE,
  MIN_TRANSACTIONS,
  parseStoredState,
  recordActivity,
  reconcileVersion,
  REVIEW_PROMPT_SCHEMA_VERSION,
  type ReviewPromptState,
} from '~/services/reviewPrompt.shared';
import { dayKeyFromDateLocal } from '~/utils/formatters';

const APP_VERSION = '1.1.5';
const INSTALL_DAY = new Date('2026-04-01T12:00:00Z');

function eligibleState(): ReviewPromptState {
  return {
    schemaVersion: REVIEW_PROMPT_SCHEMA_VERSION,
    installedAt: INSTALL_DAY.toISOString(),
    appVersion: APP_VERSION,
    lastVersionChangeAt: INSTALL_DAY.toISOString(),
    activeDaysCount: MIN_ACTIVE_DAYS,
    lastActiveDayKey: '2026-05-01',
    transactionCount: MIN_TRANSACTIONS,
    insightsViewsCount: 0,
    lastPromptAt: null,
    lastPromptVersion: null,
  };
}

const NOW = new Date('2026-05-30T12:00:00Z');

describe('reviewPrompt.checkEligibility', () => {
  it('passes when all gates are satisfied', () => {
    const result = checkEligibility({ state: eligibleState(), now: NOW, appVersion: APP_VERSION });
    expect(result).toEqual({ eligible: true });
  });

  it('blocks when install is too recent', () => {
    const state = {
      ...eligibleState(),
      installedAt: new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
    };
    const result = checkEligibility({ state, now: NOW, appVersion: APP_VERSION });
    expect(result).toEqual({ eligible: false, reason: 'too_recent_install' });
  });

  it('blocks right after an app-version change', () => {
    const state = {
      ...eligibleState(),
      lastVersionChangeAt: new Date(NOW.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
    };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'recent_version_change',
    });
  });

  it('blocks below transaction threshold', () => {
    const state = { ...eligibleState(), transactionCount: MIN_TRANSACTIONS - 1 };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'low_transaction_count',
    });
  });

  it('blocks below active-day threshold', () => {
    const state = { ...eligibleState(), activeDaysCount: MIN_ACTIVE_DAYS - 1 };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'few_active_days',
    });
  });

  it('blocks within cooldown after a previous prompt', () => {
    const state = {
      ...eligibleState(),
      lastPromptAt: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
      lastPromptVersion: '1.0.0',
    };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'recent_prompt',
    });
  });

  it('blocks when this version was already prompted', () => {
    const state = {
      ...eligibleState(),
      lastPromptAt: new Date(
        NOW.getTime() - (MIN_DAYS_BETWEEN_PROMPTS + 5) * 24 * 3600 * 1000,
      ).toISOString(),
      lastPromptVersion: APP_VERSION,
    };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'same_version_prompted',
    });
  });

  it('allows again after cooldown elapses on a new version', () => {
    const state = {
      ...eligibleState(),
      lastPromptAt: new Date(
        NOW.getTime() - (MIN_DAYS_BETWEEN_PROMPTS + 5) * 24 * 3600 * 1000,
      ).toISOString(),
      lastPromptVersion: '1.0.0',
    };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: true,
    });
  });

  it('boundary constants match expectations', () => {
    expect(MIN_DAYS_SINCE_INSTALL).toBe(7);
    expect(MIN_DAYS_SINCE_VERSION_CHANGE).toBe(3);
    expect(MIN_DAYS_BETWEEN_PROMPTS).toBe(90);
    expect(MIN_TRANSACTIONS).toBe(20);
    expect(MIN_ACTIVE_DAYS).toBe(3);
  });
});

describe('reviewPrompt.recordActivity', () => {
  it('increments active-day count on a new calendar day', () => {
    const yesterday = dayKeyFromDateLocal(new Date(NOW.getTime() - 24 * 3600 * 1000));
    const state = { ...eligibleState(), lastActiveDayKey: yesterday, activeDaysCount: 5 };
    const next = recordActivity(state, NOW);
    expect(next.activeDaysCount).toBe(6);
    expect(next.lastActiveDayKey).toBe(dayKeyFromDateLocal(NOW));
  });

  it('is a no-op on the same calendar day', () => {
    const state = {
      ...eligibleState(),
      lastActiveDayKey: dayKeyFromDateLocal(NOW),
      activeDaysCount: 5,
    };
    const next = recordActivity(state, NOW);
    expect(next).toBe(state);
  });
});

describe('reviewPrompt.reconcileVersion', () => {
  it('stamps the version change moment when the version differs', () => {
    const state = eligibleState();
    const next = reconcileVersion(state, NOW, '9.9.9');
    expect(next.appVersion).toBe('9.9.9');
    expect(next.lastVersionChangeAt).toBe(NOW.toISOString());
  });

  it('returns the same reference when the version matches', () => {
    const state = eligibleState();
    expect(reconcileVersion(state, NOW, APP_VERSION)).toBe(state);
  });
});

describe('reviewPrompt.parseStoredState', () => {
  it('returns null for missing / malformed payloads', () => {
    expect(parseStoredState(null)).toBeNull();
    expect(parseStoredState('not json')).toBeNull();
    expect(parseStoredState('{}')).toBeNull();
  });

  it('rejects mismatched schema versions', () => {
    const stored = JSON.stringify({ ...eligibleState(), schemaVersion: 999 });
    expect(parseStoredState(stored)).toBeNull();
  });

  it('round-trips a valid state', () => {
    const state = eligibleState();
    const parsed = parseStoredState(JSON.stringify(state));
    expect(parsed).toEqual(state);
  });

  it('fills missing numeric counters with defaults', () => {
    const minimal = {
      schemaVersion: REVIEW_PROMPT_SCHEMA_VERSION,
      installedAt: INSTALL_DAY.toISOString(),
      appVersion: APP_VERSION,
      lastVersionChangeAt: INSTALL_DAY.toISOString(),
    };
    const parsed = parseStoredState(JSON.stringify(minimal));
    expect(parsed?.transactionCount).toBe(0);
    expect(parsed?.activeDaysCount).toBe(0);
    expect(parsed?.lastPromptAt).toBeNull();
  });

  it('coerces non-numeric counters to 0 so tampered data cannot bypass the gate', () => {
    const tampered = {
      ...eligibleState(),
      transactionCount: 'twenty',
      activeDaysCount: 'three',
      insightsViewsCount: NaN,
    };
    const parsed = parseStoredState(JSON.stringify(tampered));
    expect(parsed?.transactionCount).toBe(0);
    expect(parsed?.activeDaysCount).toBe(0);
    expect(parsed?.insightsViewsCount).toBe(0);
  });

  it('rejects payloads whose installedAt is not a parseable ISO date', () => {
    const broken = { ...eligibleState(), installedAt: 'not-a-date' };
    expect(parseStoredState(JSON.stringify(broken))).toBeNull();
  });

  it('rejects payloads whose installedAt is an empty string', () => {
    const broken = { ...eligibleState(), installedAt: '' };
    expect(parseStoredState(JSON.stringify(broken))).toBeNull();
  });

  it('normalises an unparseable lastPromptAt to null', () => {
    const tampered = { ...eligibleState(), lastPromptAt: 'banana' };
    const parsed = parseStoredState(JSON.stringify(tampered));
    expect(parsed?.lastPromptAt).toBeNull();
  });
});

describe('reviewPrompt.checkEligibility — defensive paths', () => {
  // After parseStoredState rejection, hydrate() falls back to createInitialState
  // which is too-recent → blocks. But cover the in-memory edge case where
  // installedAt becomes corrupted between writes (the invalid-date direction
  // we flipped in daysSince).
  it('treats a malformed installedAt as "just now" so the gate blocks', () => {
    const state = { ...eligibleState(), installedAt: 'garbage' };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'too_recent_install',
    });
  });

  it('treats a malformed lastVersionChangeAt as "just now" so the gate blocks', () => {
    const state = { ...eligibleState(), lastVersionChangeAt: 'garbage' };
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'recent_version_change',
    });
  });
});

describe('reviewPrompt.createInitialState / markPrompted', () => {
  it('initial state is ineligible for at least MIN_DAYS_SINCE_INSTALL', () => {
    const state = createInitialState(NOW, APP_VERSION);
    expect(state.transactionCount).toBe(0);
    expect(state.activeDaysCount).toBe(0);
    expect(checkEligibility({ state, now: NOW, appVersion: APP_VERSION })).toEqual({
      eligible: false,
      reason: 'too_recent_install',
    });
  });

  it('markPrompted stamps lastPromptAt and lastPromptVersion', () => {
    const state = eligibleState();
    const next = markPrompted(state, NOW, APP_VERSION);
    expect(next.lastPromptAt).toBe(NOW.toISOString());
    expect(next.lastPromptVersion).toBe(APP_VERSION);
  });
});
