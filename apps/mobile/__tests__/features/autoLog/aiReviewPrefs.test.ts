import { parsePaymentAlertPrefs } from '~/features/autoLog/lib/prefs';

describe('AI auto-review prefs', () => {
  it('is off and logs expenses only for prefs saved before the feature', () => {
    expect(parsePaymentAlertPrefs('{"version":1,"alertsEnabled":true}').aiReview).toEqual({
      enabled: false,
      logTypes: 'expense',
    });
  });

  it('keeps a saved Both choice', () => {
    expect(
      parsePaymentAlertPrefs(JSON.stringify({ aiReview: { enabled: true, logTypes: 'both' } }))
        .aiReview,
    ).toEqual({ enabled: true, logTypes: 'both' });
  });

  it('keeps valid settings and repairs invalid ones field by field', () => {
    expect(
      parsePaymentAlertPrefs(JSON.stringify({ aiReview: { enabled: true, logTypes: 'income' } }))
        .aiReview,
    ).toEqual({ enabled: true, logTypes: 'income' });
    expect(
      parsePaymentAlertPrefs(JSON.stringify({ aiReview: { enabled: 'yes', logTypes: 'all' } }))
        .aiReview,
    ).toEqual({ enabled: false, logTypes: 'expense' });
  });

  it('drops an account filter saved by an earlier build: every linked account is covered', () => {
    expect(
      parsePaymentAlertPrefs(
        JSON.stringify({ aiReview: { enabled: true, logTypes: 'both', accountIds: ['a1'] } }),
      ).aiReview,
    ).toEqual({ enabled: true, logTypes: 'both' });
  });
});
