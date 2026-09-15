import {
  getHomeSummaryPreferences,
  parseCalendarPreferencesSnapshot,
  updateHomeSummaryPreference,
} from '~/features/calendar/lib/calendarPreferences';

describe('calendar preferences', () => {
  it('keeps the existing two-card layout as the default', () => {
    expect(getHomeSummaryPreferences(undefined)).toEqual({ left: 'income', right: 'expense' });
  });

  it('reads valid independent left and right metrics', () => {
    expect(
      getHomeSummaryPreferences(
        JSON.stringify({ homeSummaryLeft: 'balance', homeSummaryRight: 'income' }),
      ),
    ).toEqual({ left: 'balance', right: 'income' });
  });

  it('falls back per side when stored values are invalid', () => {
    expect(
      getHomeSummaryPreferences(
        JSON.stringify({ homeSummaryLeft: 'profit', homeSummaryRight: 'balance' }),
      ),
    ).toEqual({ left: 'income', right: 'balance' });
  });

  it('updates one card without losing calendar filters or the other card', () => {
    const current = JSON.stringify({
      version: 1,
      excludedAccountIds: ['cash'],
      excludedIncomeCategoryIds: ['salary'],
      homeSummaryRight: 'balance',
    });

    expect(JSON.parse(updateHomeSummaryPreference(current, 'left', 'expense'))).toEqual({
      version: 3,
      excludedAccountIds: ['cash'],
      excludedIncomeCategoryIds: ['salary'],
      homeSummaryLeft: 'expense',
      homeSummaryRight: 'balance',
    });
  });

  it('parses legacy filter-only snapshots', () => {
    expect(
      parseCalendarPreferencesSnapshot(
        JSON.stringify({ version: 1, excludedExpenseCategoryIds: ['food'] }),
      ),
    ).toEqual({
      version: 1,
      excludedAccountIds: undefined,
      excludedIncomeCategoryIds: undefined,
      excludedExpenseCategoryIds: ['food'],
      homeSummaryLeft: undefined,
      homeSummaryRight: undefined,
      homeSummaryLeftHidden: undefined,
      homeSummaryRightHidden: undefined,
    });
  });

  it('restores each hidden summary card independently and ignores invalid values', () => {
    expect(
      parseCalendarPreferencesSnapshot(
        JSON.stringify({ homeSummaryLeftHidden: true, homeSummaryRightHidden: 'false' }),
      ),
    ).toMatchObject({ homeSummaryLeftHidden: true, homeSummaryRightHidden: undefined });
  });
});
