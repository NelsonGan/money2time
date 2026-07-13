import type { SplitRowLike } from '~/features/transactions/lib/splitMath';
import {
  applyPercent,
  buildSplitInputs,
  nextEditableAmountIndex,
  scaleToTarget,
  sumUnpaidRows,
} from '~/features/transactions/lib/splitMath';

const row = (
  amount: string,
  { isSelf = false, paid = false }: { isSelf?: boolean; paid?: boolean } = {},
): SplitRowLike & { personName: string } => ({
  amount,
  isSelf,
  paid: paid ? { paidAt: '2026-07-01' } : undefined,
  personName: isSelf ? 'Me' : 'Friend',
});

const cents = (n: number) => Math.round(n * 100);
const sumCents = (values: number[]) => values.reduce((acc, v) => acc + cents(v), 0);

describe('sumUnpaidRows', () => {
  it('sums unpaid rows and skips paid rows', () => {
    const rows = [row('10.00', { isSelf: true }), row('20.50'), row('5.00', { paid: true })];
    expect(sumUnpaidRows(rows)).toBe(30.5);
  });

  it('treats empty and invalid amounts as zero', () => {
    const rows = [row('', { isSelf: true }), row('1.2.3'), row('7')];
    expect(sumUnpaidRows(rows)).toBe(7);
  });

  it('rounds to cents to avoid float drift', () => {
    const rows = [row('0.1'), row('0.2')];
    expect(sumUnpaidRows(rows)).toBe(0.3);
  });
});

describe('nextEditableAmountIndex', () => {
  it('returns the next non-paid row after the current index', () => {
    const rows = [row('1', { isSelf: true }), row('2'), row('3')];
    expect(nextEditableAmountIndex(rows, 0)).toBe(1);
    expect(nextEditableAmountIndex(rows, 1)).toBe(2);
  });

  it('skips paid rows', () => {
    const rows = [row('1', { isSelf: true }), row('2', { paid: true }), row('3')];
    expect(nextEditableAmountIndex(rows, 0)).toBe(2);
  });

  it('returns null when no editable row follows', () => {
    const rows = [row('1', { isSelf: true }), row('2'), row('3', { paid: true })];
    expect(nextEditableAmountIndex(rows, 1)).toBeNull();
    expect(nextEditableAmountIndex(rows, 2)).toBeNull();
  });

  it('returns null for a single row', () => {
    expect(nextEditableAmountIndex([row('1', { isSelf: true })], 0)).toBeNull();
  });
});

describe('scaleToTarget', () => {
  it('rescales proportionally and sums to the target exactly in cents', () => {
    const cases: { amounts: number[]; target: number }[] = [
      { amounts: [33.33, 33.33, 33.34], target: 110 },
      { amounts: [10, 20, 30], target: 63.6 },
      { amounts: [1, 1, 1], target: 1 },
      { amounts: [0.1, 0.1, 0.1], target: 0.32 },
      { amounts: [12.5], target: 99.99 },
      { amounts: [5, 0, 15], target: 21.4 },
    ];
    for (const { amounts, target } of cases) {
      const result = scaleToTarget(amounts, target);
      expect(sumCents(result)).toBe(cents(target));
      result.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    }
  });

  it('keeps results within one cent of the exact proportional share', () => {
    const amounts = [10, 20, 30];
    const target = 63.6;
    const total = 60;
    const result = scaleToTarget(amounts, target);
    result.forEach((v, i) => {
      const exact = (amounts[i]! * target) / total;
      expect(Math.abs(v - exact)).toBeLessThan(0.01 + 1e-9);
    });
  });

  it('scales down for discounts', () => {
    const result = scaleToTarget([10, 20, 30], 54);
    expect(result).toEqual([9, 18, 27]);
  });

  it('gives remainder cents to preferIndex first on ties', () => {
    // 2.00 over three equal shares: exact = 66.66… cents each, two get 67.
    const result = scaleToTarget([1, 1, 1], 2, 0);
    expect(sumCents(result)).toBe(200);
    expect(result[0]).toBe(0.67);
  });

  it('splits evenly with leftover cents from preferIndex when all inputs are zero', () => {
    const result = scaleToTarget([0, 0, 0], 1, 1);
    expect(sumCents(result)).toBe(100);
    expect(result[1]).toBe(0.34);
    expect(result[0]).toBe(0.33);
    expect(result[2]).toBe(0.33);
  });

  it('returns amounts unchanged for a negative target', () => {
    expect(scaleToTarget([10, 20], -5)).toEqual([10, 20]);
  });

  it('returns all zeros for a zero target', () => {
    expect(scaleToTarget([10, 20], 0)).toEqual([0, 0]);
  });

  it('does not mutate its input', () => {
    const amounts = [10, 20, 30];
    scaleToTarget(amounts, 100);
    expect(amounts).toEqual([10, 20, 30]);
  });
});

describe('applyPercent', () => {
  it('adds the percentage proportionally across unpaid rows', () => {
    const rows = [row('10.00', { isSelf: true }), row('20.00'), row('30.00')];
    const result = applyPercent(rows, 6);
    expect(result).not.toBeNull();
    expect(result!.map((r) => r.amount)).toEqual(['10.60', '21.20', '31.80']);
  });

  it('sums exactly on non-terminating shares, extra cents preferring Me', () => {
    const rows = [row('0.10', { isSelf: true }), row('0.10'), row('0.10')];
    const result = applyPercent(rows, 7)!;
    // 0.30 * 1.07 = 0.321 → rounds to 0.32; two leftover cents land on the
    // first tied rows, Me first.
    expect(sumUnpaidRows(result)).toBe(0.32);
    expect(result[0]!.amount).toBe('0.11');
    expect(result[1]!.amount).toBe('0.11');
    expect(result[2]!.amount).toBe('0.10');
  });

  it('freezes paid rows and excludes them from the base', () => {
    const rows = [row('10.00', { isSelf: true }), row('20.00'), row('50.00', { paid: true })];
    const result = applyPercent(rows, 10)!;
    expect(result[2]!.amount).toBe('50.00');
    expect(sumUnpaidRows(result)).toBe(33);
  });

  it('preserves other row fields and does not mutate input rows', () => {
    const rows = [row('10.00', { isSelf: true }), row('20.00')];
    const result = applyPercent(rows, 5)!;
    expect(result[1]!.personName).toBe('Friend');
    expect(rows[0]!.amount).toBe('10.00');
  });

  it('returns null when the percent or base is unusable', () => {
    const rows = [row('10.00', { isSelf: true }), row('20.00')];
    expect(applyPercent(rows, Number.NaN)).toBeNull();
    expect(applyPercent(rows, -100)).toBeNull();
    expect(applyPercent(rows, -150)).toBeNull();
    expect(applyPercent([row('0'), row('0')], 6)).toBeNull();
    expect(applyPercent([row('10.00', { paid: true })], 6)).toBeNull();
  });

  it('allows negative percentages above -100 as discounts', () => {
    const rows = [row('10.00', { isSelf: true }), row('30.00')];
    const result = applyPercent(rows, -10)!;
    expect(result.map((r) => r.amount)).toEqual(['9.00', '27.00']);
  });
});

describe('applyPercent rounding', () => {
  it('gives remainder cents to the Me row regardless of its position', () => {
    const rows = [row('0.33'), row('0.33', { isSelf: true }), row('0.33')];
    // 0.99 * 1.05 = 1.0395 → 1.04; two leftover cents, Me first then index 0.
    const result = applyPercent(rows, 5)!;
    expect(sumUnpaidRows(result)).toBe(1.04);
    expect(result.map((r) => r.amount)).toEqual(['0.35', '0.35', '0.34']);
  });
});

describe('buildSplitInputs', () => {
  const src = (
    personName: string,
    amount: string,
    extra: { isSelf?: boolean; shared?: boolean; isShared?: boolean; note?: string | null } = {},
  ) => ({
    personName,
    amount,
    isSelf: extra.isSelf ?? false,
    shared: extra.shared ?? false,
    isShared: extra.isShared ?? false,
    note: extra.note ?? null,
    paybackAccountId: null,
  });

  it('maps non-shared rows 1:1', () => {
    const rows = [src('Alice', '12'), src('', '8', { isSelf: true })];
    const out = buildSplitInputs(rows, 'acc');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ personName: 'Alice', amount: 12, paybackAccountId: 'acc' });
    expect(out[1]).toMatchObject({ personName: null, isSelf: true, amount: 8 });
  });

  it('keeps re-loaded shared portions 1:1 (isShared) without re-expanding them', () => {
    // A saved by-item bill reopens with its already-divided shared portions
    // flagged isShared (NOT shared). They must map straight through — re-pooling
    // them would double-divide the shares on every save.
    const rows = [
      src('Alice', '15', { isShared: true, note: 'Wine, Bread' }),
      src('', '15', { isSelf: true, isShared: true, note: 'Wine, Bread' }),
    ];
    const out = buildSplitInputs(rows, 'acc', sharedNote);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ personName: 'Alice', amount: 15, isShared: true });
    expect(out[1]).toMatchObject({ personName: null, isSelf: true, amount: 15, isShared: true });
  });

  const sharedNote = (names: string[]) =>
    names.length ? `${names.join(', ')} (Shared)` : 'Shared';

  it('divides shared items across assigned people + Me', () => {
    // Alice has $12, Me has $8, a $30 shared item → users = Me + Alice (2),
    // each gets +15. Shared rows are not emitted as their own line.
    const rows = [
      src('Alice', '12'),
      src('', '8', { isSelf: true }),
      src('', '30', { shared: true, note: 'Wine' }),
    ];
    const out = buildSplitInputs(rows, 'acc', sharedNote);
    // 2 base + 2 shared shares.
    expect(out).toHaveLength(4);
    const me = out.filter((r) => r.isSelf);
    const alice = out.filter((r) => r.personName === 'Alice');
    expect(me.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(8 + 15);
    expect(alice.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(12 + 15);
    // The two shared shares are flagged isShared; the base rows are not.
    expect(out.filter((r) => r.isShared)).toHaveLength(2);
    expect(out.filter((r) => !r.isShared)).toHaveLength(2);
    // The note (from the passed formatter) rides on the shared shares.
    expect(out.filter((r) => r.note === 'Wine (Shared)')).toHaveLength(2);
    // Total is preserved.
    expect(out.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(50);
  });

  it('divides shared items with an unnamed friend ("Someone") too', () => {
    // Someone (blank name) has their own $10 item, Me has $10, plus a $20 shared
    // item → users = Me + Someone (2), each gets +10. The unnamed friend is a
    // distinct user, not skipped, so they owe their share of the shared item.
    const rows = [
      src('', '10', { isSelf: true }),
      src('', '10'),
      src('', '20', { shared: true, note: 'Wine' }),
    ];
    const out = buildSplitInputs(rows, 'acc', sharedNote);
    // 2 base + 2 shared shares (Me + Someone).
    expect(out).toHaveLength(4);
    expect(out.filter((r) => r.note === 'Wine (Shared)')).toHaveLength(2);
    const me = out.filter((r) => r.isSelf);
    const someone = out.filter((r) => !r.isSelf);
    expect(me.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(10 + 10);
    expect(someone.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(10 + 10);
    expect(out.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(40);
  });

  it('labels an unnamed friend ("Person A") so own + shared items group', () => {
    // Someone (blank name) has a $10 item, Me has $10, plus a $20 shared item.
    // With a name formatter the unnamed friend becomes "Person A" on BOTH their
    // own line and their shared share, so they group as one person.
    const anon = (i: number) => `Person ${String.fromCharCode(65 + i)}`;
    const rows = [
      src('', '10', { isSelf: true }),
      src('', '10'),
      src('', '20', { shared: true, note: 'Wine' }),
    ];
    const out = buildSplitInputs(rows, 'acc', sharedNote, anon);
    expect(out).toHaveLength(4);
    const personA = out.filter((r) => r.personName === 'Person A');
    // Both the own item ($10) and the shared share ($10) carry "Person A".
    expect(personA).toHaveLength(2);
    expect(personA.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(20);
    expect(personA.some((r) => r.note === 'Wine (Shared)')).toBe(true);
  });

  it('lists every shared item name in the shared note', () => {
    const rows = [
      src('Alice', '10'),
      src('', '6', { shared: true, note: 'Wine' }),
      src('', '4', { shared: true, note: 'Bread' }),
    ];
    const out = buildSplitInputs(rows, null, sharedNote);
    expect(out.some((r) => r.note === 'Wine, Bread (Shared)')).toBe(true);
  });

  it('does not count shared-only people as users', () => {
    // Only Me has an assigned item; Bob appears only on a shared row → Bob is
    // not a user, so the shared $20 goes entirely to Me.
    const rows = [src('', '10', { isSelf: true }), src('Bob', '20', { shared: true })];
    const out = buildSplitInputs(rows, null);
    expect(out).toHaveLength(2); // Me base + Me shared share
    expect(out.every((r) => r.isSelf)).toBe(true);
    expect(out.reduce((a, r) => a + r.amount, 0)).toBeCloseTo(30);
  });

  it('ignores a zero-value shared pool', () => {
    const rows = [src('Alice', '12'), src('', '0', { shared: true })];
    const out = buildSplitInputs(rows, null);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ personName: 'Alice', amount: 12 });
  });
});
