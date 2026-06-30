import {
  checkEligibility,
  type CloudBackupPromptState,
  createInitialState,
  MAX_SHOWS,
  MIN_DAYS_BETWEEN_PROMPTS,
  MIN_TRANSACTIONS_BEFORE_PROMPT,
  markShown,
  parseStoredState,
} from '~/services/cloudBackupPrompt.shared';

const NOW = new Date('2026-06-30T12:00:00.000Z');

function stateWith(overrides: Partial<CloudBackupPromptState> = {}): CloudBackupPromptState {
  return { ...createInitialState(), ...overrides };
}

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('cloud backup prompt eligibility', () => {
  const base = {
    now: NOW,
    isOnCloudBackup: false,
    transactionCount: MIN_TRANSACTIONS_BEFORE_PROMPT,
  };

  it('is eligible on a fresh state once the transaction floor is met', () => {
    expect(checkEligibility({ state: stateWith(), ...base })).toEqual({ eligible: true });
  });

  it('never shows when already on a cloud target', () => {
    expect(checkEligibility({ state: stateWith(), ...base, isOnCloudBackup: true })).toEqual({
      eligible: false,
      reason: 'already_on_cloud',
    });
  });

  it('waits until a few transactions have been logged', () => {
    expect(
      checkEligibility({
        state: stateWith(),
        ...base,
        transactionCount: MIN_TRANSACTIONS_BEFORE_PROMPT - 1,
      }),
    ).toEqual({ eligible: false, reason: 'too_few_transactions' });
  });

  it('stops after the maximum number of shows', () => {
    expect(checkEligibility({ state: stateWith({ shownCount: MAX_SHOWS }), ...base })).toEqual({
      eligible: false,
      reason: 'max_shows_reached',
    });
  });

  it('enforces the spacing window between prompts', () => {
    expect(
      checkEligibility({
        state: stateWith({ shownCount: 1, lastShownAt: daysAgoIso(MIN_DAYS_BETWEEN_PROMPTS - 1) }),
        ...base,
      }),
    ).toEqual({ eligible: false, reason: 'too_recent' });
  });

  it('is eligible again once the spacing window has passed', () => {
    expect(
      checkEligibility({
        state: stateWith({ shownCount: 1, lastShownAt: daysAgoIso(MIN_DAYS_BETWEEN_PROMPTS + 1) }),
        ...base,
      }),
    ).toEqual({ eligible: true });
  });

  it('treats a corrupted lastShownAt as "just shown" (suppresses)', () => {
    expect(
      checkEligibility({
        state: { schemaVersion: 1, shownCount: 1, lastShownAt: 'not-a-date' as string },
        ...base,
      }),
    ).toEqual({ eligible: false, reason: 'too_recent' });
  });
});

describe('markShown', () => {
  it('increments the count and stamps the time', () => {
    const next = markShown(stateWith({ shownCount: 1 }), NOW);
    expect(next.shownCount).toBe(2);
    expect(next.lastShownAt).toBe(NOW.toISOString());
  });
});

describe('parseStoredState', () => {
  it('returns null for empty / malformed input', () => {
    expect(parseStoredState(null)).toBeNull();
    expect(parseStoredState('{bad json')).toBeNull();
  });

  it('rejects a mismatched schema version', () => {
    expect(parseStoredState(JSON.stringify({ schemaVersion: 99, shownCount: 2 }))).toBeNull();
  });

  it('coerces invalid fields to safe defaults', () => {
    const parsed = parseStoredState(
      JSON.stringify({ schemaVersion: 1, shownCount: -5, lastShownAt: 'nope' }),
    );
    expect(parsed).toEqual({ schemaVersion: 1, shownCount: 0, lastShownAt: null });
  });
});
