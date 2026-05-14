import { newAppUserId, newId, nowIso } from '~/utils/id';

describe('newId', () => {
  it('produces a UUID-shaped string with version 4 nibble', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
  });
});

describe('newAppUserId', () => {
  it('prefixes the id with m2t_', () => {
    expect(newAppUserId()).toMatch(/^m2t_[0-9a-f-]+$/);
  });
});

describe('nowIso', () => {
  it('returns an ISO-8601 string for the current time', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});
