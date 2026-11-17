import { billEffect } from '~/features/albums/lib/billEffect';

const shares = (entries: Record<string, number>) =>
  Object.entries(entries).map(([memberId, amount]) => ({ memberId, amount }));

describe('billEffect', () => {
  it('is the share the user borrowed when someone else paid', () => {
    expect(
      billEffect(
        {
          id: 'b',
          amount: 132.4,
          paidBy: 'dan',
          shares: shares({ dan: 33.1, me: 33.1, aisha: 66.2 }),
        },
        'me',
      ),
    ).toEqual({ kind: 'borrowed', amount: 33.1 });
  });

  it("is the others' shares when the user paid", () => {
    expect(
      billEffect(
        { id: 'b', amount: 180, paidBy: 'me', shares: shares({ me: 45, dan: 67.5, aisha: 67.5 }) },
        'me',
      ),
    ).toEqual({ kind: 'lent', amount: 135 });
    // Paid for others only: all of it was lent.
    expect(
      billEffect({ id: 'b', amount: 20, paidBy: 'me', shares: shares({ dan: 20 }) }, 'me'),
    ).toEqual({
      kind: 'lent',
      amount: 20,
    });
  });

  it('is the whole bill when it was the user’s alone', () => {
    expect(
      billEffect({ id: 'b', amount: 24.4, paidBy: 'me', shares: shares({ me: 24.4 }) }, 'me'),
    ).toEqual({
      kind: 'paid',
      amount: 24.4,
    });
  });

  it('is nothing for a bill the user is not on, or before they are a member', () => {
    expect(
      billEffect(
        { id: 'b', amount: 20, paidBy: 'aisha', shares: shares({ aisha: 10, dan: 10 }) },
        'me',
      ),
    ).toEqual({ kind: 'none' });
    expect(
      billEffect({ id: 'b', amount: 20, paidBy: 'aisha', shares: shares({ aisha: 20 }) }, null),
    ).toEqual({ kind: 'none' });
  });

  it('adds shares in cents', () => {
    expect(
      billEffect(
        { id: 'b', amount: 0.3, paidBy: 'me', shares: shares({ me: 0.1, dan: 0.1, aisha: 0.1 }) },
        'me',
      ),
    ).toEqual({ kind: 'lent', amount: 0.2 });
  });
});
