import type { SplitRowLike } from '~/features/transactions/lib/splitMath';
import {
  applyPercent,
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
