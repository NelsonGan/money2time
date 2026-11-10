import { I18n, setAppLocale } from '../../lib/i18n';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

describe('placeholders', () => {
  afterEach(() => {
    setAppLocale('en');
  });

  it('reads a percent sign before a {{placeholder}} as text (Turkish "%10")', () => {
    setAppLocale('tr');
    expect(I18n.t('transactions.editor.split.percent_chip', { percent: 10 })).toBe('%10');
    expect(I18n.t('pro.save_percent', { percent: 40 })).toBe('%40 tasarruf et');
  });

  it('still fills {{name}} and %{name} placeholders', () => {
    expect(I18n.t('transactions.editor.split.percent_chip', { percent: 10 })).toBe('10%');
    expect(I18n.t('x', { defaultValue: '%{current} of %{total}', current: 2, total: 5 })).toBe(
      '2 of 5',
    );
  });

  it('leaves no Turkish string with a %{{placeholder}} unfilled', () => {
    setAppLocale('tr');
    const text = I18n.t('insights.trend_stats.vs_average', { percent: 12, defaultValue: '' });
    expect(text).not.toContain('missing');
  });
});
