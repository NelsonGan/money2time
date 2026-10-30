import { dateForNewTransaction } from '~/utils/formatters';
import { sortTransactions } from '~/utils/transactionSorting';

describe('dateForNewTransaction', () => {
  const now = new Date(2026, 9, 30, 18, 45, 12);

  it('stores now for a bare day key of today', () => {
    expect(dateForNewTransaction('2026-10-30', now)).toBe(now.toISOString());
  });

  it("stores now for today's local midnight, as the editor sends it", () => {
    const midnight = new Date(2026, 9, 30).toISOString();
    expect(dateForNewTransaction(midnight, now)).toBe(now.toISOString());
  });

  it('keeps another day as given', () => {
    expect(dateForNewTransaction('2026-10-29', now)).toBe('2026-10-29');
    const yesterday = new Date(2026, 9, 29).toISOString();
    expect(dateForNewTransaction(yesterday, now)).toBe(yesterday);
  });

  it('keeps a value that already has a time of day', () => {
    const captured = new Date(2026, 9, 30, 9, 15).toISOString();
    expect(dateForNewTransaction(captured, now)).toBe(captured);
  });

  it('puts the latest manual entry above earlier timed rows on the same day', () => {
    const adjustment = {
      id: 'a',
      amount: 1,
      date: new Date(2026, 9, 30, 12, 0).toISOString(),
      createdAt: new Date(2026, 9, 30, 12, 0).toISOString(),
    };
    const manual = {
      id: 'b',
      amount: 1,
      date: dateForNewTransaction(new Date(2026, 9, 30).toISOString(), now),
      createdAt: now.toISOString(),
    };
    expect(sortTransactions([adjustment, manual], 'date_desc').map((t) => t.id)).toEqual([
      'b',
      'a',
    ]);
  });
});
