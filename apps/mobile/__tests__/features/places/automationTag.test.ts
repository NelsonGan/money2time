import {
  AUTOMATION_TAG_MAX_AGE_MS,
  requestAutomationTag,
  resetAutomationTag,
  shouldAutomationTag,
  subscribeAutomationTag,
  takeAutomationTagRequests,
} from '~/features/places/lib/automationTag';

// Midday local time, so "today" never straddles midnight in any timezone.
const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const ON = { locationsEnabled: true, autoTag: true };
const todayExpense = {
  type: 'expense',
  date: new Date(NOW).toISOString(),
  located: false,
  deleted: false,
};
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60 * 1000).toISOString();

describe('shouldAutomationTag', () => {
  it('tags an expense dated today that the app saw moments after the payment', () => {
    expect(shouldAutomationTag(todayExpense, minutesAgo(1), ON, NOW)).toBe(true);
    expect(shouldAutomationTag(todayExpense, minutesAgo(9.9), ON, NOW)).toBe(true);
  });

  it('accepts a bare day key for today', () => {
    expect(
      shouldAutomationTag({ ...todayExpense, date: '2026-11-24' }, minutesAgo(1), ON, NOW),
    ).toBe(true);
  });

  it('leaves a payment the app saw too late untagged', () => {
    const late = new Date(NOW - AUTOMATION_TAG_MAX_AGE_MS - 1).toISOString();
    expect(shouldAutomationTag(todayExpense, late, ON, NOW)).toBe(false);
    expect(shouldAutomationTag(todayExpense, minutesAgo(180), ON, NOW)).toBe(false);
  });

  it('allows a little clock skew but not a payment far in the future', () => {
    expect(shouldAutomationTag(todayExpense, minutesAgo(-1), ON, NOW)).toBe(true);
    expect(shouldAutomationTag(todayExpense, minutesAgo(-30), ON, NOW)).toBe(false);
  });

  it('needs both switches on', () => {
    expect(
      shouldAutomationTag(
        todayExpense,
        minutesAgo(1),
        { locationsEnabled: false, autoTag: true },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldAutomationTag(
        todayExpense,
        minutesAgo(1),
        { locationsEnabled: true, autoTag: false },
        NOW,
      ),
    ).toBe(false);
  });

  it('tags expenses only, never income', () => {
    expect(shouldAutomationTag({ ...todayExpense, type: 'income' }, minutesAgo(1), ON, NOW)).toBe(
      false,
    );
  });

  it('never touches an entry with a place, or a deleted one', () => {
    expect(shouldAutomationTag({ ...todayExpense, located: true }, minutesAgo(1), ON, NOW)).toBe(
      false,
    );
    expect(shouldAutomationTag({ ...todayExpense, deleted: true }, minutesAgo(1), ON, NOW)).toBe(
      false,
    );
  });

  it('leaves an entry dated another day untagged, as a screenshot of an older receipt', () => {
    expect(
      shouldAutomationTag({ ...todayExpense, date: '2026-11-23' }, minutesAgo(1), ON, NOW),
    ).toBe(false);
  });

  it('ignores an unreadable payment time', () => {
    expect(shouldAutomationTag(todayExpense, 'not a date', ON, NOW)).toBe(false);
  });
});

describe('automation tag requests', () => {
  beforeEach(() => resetAutomationTag());

  it('queues requests until the host takes them, and tells it', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAutomationTag(listener);
    requestAutomationTag({ transactionId: 'a', occurredAt: minutesAgo(1) });
    requestAutomationTag({ transactionId: 'b', occurredAt: minutesAgo(2) });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(takeAutomationTagRequests().map((request) => request.transactionId)).toEqual(['a', 'b']);
    expect(takeAutomationTagRequests()).toEqual([]);
    unsubscribe();
    requestAutomationTag({ transactionId: 'c', occurredAt: minutesAgo(1) });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps a request made before the host subscribed', () => {
    requestAutomationTag({ transactionId: 'early', occurredAt: minutesAgo(1) });
    expect(takeAutomationTagRequests()).toHaveLength(1);
  });
});
