import { formatAlbumMonthYear } from '~/features/albums/utils';

describe('formatAlbumMonthYear', () => {
  it('formats a day-key into a short month + year label', () => {
    expect(formatAlbumMonthYear('2026-06-03', { locale: 'en' })).toBe('Jun 2026');
  });

  it('formats an ISO datetime into a short month + year label', () => {
    expect(formatAlbumMonthYear('2025-12-31T18:30:00.000Z', { locale: 'en' })).toBe('Dec 2025');
  });

  it('returns null when there is no date', () => {
    expect(formatAlbumMonthYear(null, { locale: 'en' })).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(formatAlbumMonthYear('not-a-date', { locale: 'en' })).toBeNull();
  });
});
