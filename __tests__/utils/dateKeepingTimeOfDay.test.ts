import { dateKeepingTimeOfDay, dayKeyFromIsoLocal } from '~/utils/formatters';

describe('keeping a transaction’s time when its day is picked', () => {
  const evening = new Date(2026, 4, 13, 21, 15, 30, 250).toISOString();
  const midnight = new Date(2026, 4, 13).toISOString();

  it('leaves the stored value untouched when the day does not change', () => {
    expect(dateKeepingTimeOfDay('2026-05-13', evening)).toBe(evening);
    expect(dateKeepingTimeOfDay('2026-05-13', midnight)).toBe(midnight);
  });

  it('moves the same local time of day onto a new day', () => {
    const moved = dateKeepingTimeOfDay('2026-05-20', evening);
    expect(moved).toBe(new Date(2026, 4, 20, 21, 15, 30, 250).toISOString());
    expect(dayKeyFromIsoLocal(moved)).toBe('2026-05-20');
  });

  it('keeps a date-only row date-only', () => {
    expect(dateKeepingTimeOfDay('2026-05-13', '2026-05-13')).toBe('2026-05-13');
    expect(dateKeepingTimeOfDay('2026-05-20', '2026-05-13')).toBe('2026-05-20');
  });

  it('takes a full timestamp as given', () => {
    const explicit = new Date(2026, 4, 20, 9).toISOString();
    expect(dateKeepingTimeOfDay(explicit, evening)).toBe(explicit);
  });
});
