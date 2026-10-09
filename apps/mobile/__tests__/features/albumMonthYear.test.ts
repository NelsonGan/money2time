import { formatAlbumMonthYear } from '~/features/albums/utils';

describe('formatAlbumMonthYear', () => {
  it('formats a day-key into a short month + year label', () => {
    expect(formatAlbumMonthYear('2026-06-03', { locale: 'en' })).toBe('Jun 2026');
  });

  it('formats an ISO datetime into a short month + year label', () => {
    // Midday UTC mid-month: the label resolves through the *local* day key, so
    // an edge-of-month stamp would read as a different month either side of UTC
    // (18:30Z on Dec 31 is already January in UTC+8). Keep the input far enough
    // from both boundaries that every real offset agrees on the month.
    expect(formatAlbumMonthYear('2025-12-15T12:00:00.000Z', { locale: 'en' })).toBe('Dec 2025');
  });

  it('returns null when there is no date', () => {
    expect(formatAlbumMonthYear(null, { locale: 'en' })).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(formatAlbumMonthYear('not-a-date', { locale: 'en' })).toBeNull();
  });
});
