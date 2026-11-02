import { aiReviewCoversAccount, parsePaymentAlertPrefs } from '~/features/autoLog/lib/prefs';

describe('AI auto-review prefs', () => {
  it('is off, both types and all accounts for prefs saved before the feature', () => {
    expect(parsePaymentAlertPrefs('{"version":1,"alertsEnabled":true}').aiReview).toEqual({
      enabled: false,
      logTypes: 'both',
      accountIds: null,
    });
  });

  it('keeps valid settings and repairs invalid ones field by field', () => {
    expect(
      parsePaymentAlertPrefs(
        JSON.stringify({ aiReview: { enabled: true, logTypes: 'income', accountIds: ['a1', 7] } }),
      ).aiReview,
    ).toEqual({ enabled: true, logTypes: 'income', accountIds: ['a1'] });
    expect(
      parsePaymentAlertPrefs(JSON.stringify({ aiReview: { enabled: 'yes', logTypes: 'all' } }))
        .aiReview,
    ).toEqual({ enabled: false, logTypes: 'both', accountIds: null });
  });

  it('covers an account only when one is bound and selected', () => {
    const all = { enabled: true, logTypes: 'both' as const, accountIds: null };
    expect(aiReviewCoversAccount(all, 'a1')).toBe(true);
    expect(aiReviewCoversAccount(all, null)).toBe(false);
    expect(aiReviewCoversAccount({ ...all, accountIds: ['a2'] }, 'a1')).toBe(false);
  });
});
