import {
  applyMethodValues,
  balanceSelfPercent,
  defaultMethodValue,
  initialMethodValues,
  methodValueSum,
  scaleAdjustments,
  splitMethodProblem,
  trimNumber,
} from '~/features/transactions/lib/splitMethods';

interface Row {
  amount: string;
  isSelf: boolean;
  paid?: { paidAt: string };
}

const me = (amount = '0.00'): Row => ({ amount, isSelf: true });
const friend = (amount = '0.00', paid = false): Row => ({
  amount,
  isSelf: false,
  paid: paid ? { paidAt: '2026-11-01' } : undefined,
});
const amounts = (rows: Row[]) => rows.map((row) => row.amount);

describe('applyMethodValues', () => {
  it('leaves rows alone in amount mode', () => {
    const rows = [me('10.00'), friend('5.00')];
    expect(applyMethodValues('amount', rows, ['1', '2'], 99)).toBe(rows);
  });

  it('splits by percentages that add up to 100, odd cents to Me', () => {
    const rows = [me(), friend(), friend()];
    expect(amounts(applyMethodValues('percent', rows, ['33.33', '33.33', '33.34'], 100))).toEqual([
      '33.33',
      '33.33',
      '33.34',
    ]);
    expect(amounts(applyMethodValues('percent', rows, ['50', '30', '20'], 120))).toEqual([
      '60.00',
      '36.00',
      '24.00',
    ]);
    // 1/3 each of 10.00: the leftover cent lands on Me.
    const third = applyMethodValues('percent', rows, ['33.33', '33.33', '33.34'], 10);
    expect(amounts(third).reduce((sum, a) => sum + Number(a), 0)).toBeCloseTo(10, 5);
  });

  it('gives each person their percentage when they do not add up to 100', () => {
    const rows = [me(), friend()];
    expect(amounts(applyMethodValues('percent', rows, ['50', '20'], 120))).toEqual([
      '60.00',
      '24.00',
    ]);
  });

  it('splits by shares and always adds up to the bill', () => {
    const rows = [me(), friend(), friend()];
    expect(amounts(applyMethodValues('shares', rows, ['2', '1', '1'], 120))).toEqual([
      '60.00',
      '30.00',
      '30.00',
    ]);
    expect(amounts(applyMethodValues('shares', rows, ['1', '1', '1'], 100))).toEqual([
      '33.34',
      '33.33',
      '33.33',
    ]);
    expect(amounts(applyMethodValues('shares', rows, ['1.5', '0.5', '0'], 40))).toEqual([
      '30.00',
      '10.00',
      '0.00',
    ]);
  });

  it('gives everyone nothing when there are no shares', () => {
    const rows = [me('5.00'), friend('5.00')];
    expect(amounts(applyMethodValues('shares', rows, ['0', '0'], 10))).toEqual(['0.00', '0.00']);
  });

  it('splits evenly and then adds each adjustment', () => {
    const rows = [me(), friend(), friend()];
    expect(amounts(applyMethodValues('adjust', rows, ['5', '5', '-10'], 120))).toEqual([
      '45.00',
      '45.00',
      '30.00',
    ]);
    expect(amounts(applyMethodValues('adjust', rows, ['0', '0', '0'], 100))).toEqual([
      '33.34',
      '33.33',
      '33.33',
    ]);
  });

  it('lets an adjustment push an amount below zero (the sum bar blocks it)', () => {
    const rows = [me(), friend()];
    expect(amounts(applyMethodValues('adjust', rows, ['0', '30'], 20))).toEqual(['-5.00', '25.00']);
  });

  it('divides only what is still owed, keeping paid rows', () => {
    const rows = [me(), friend('40.00', true), friend()];
    const next = applyMethodValues('shares', rows, ['1', '', '3'], 80);
    expect(amounts(next)).toEqual(['20.00', '40.00', '60.00']);
    expect(next[1]).toBe(rows[1]);
  });
});

describe('initialMethodValues', () => {
  it('turns the current amounts into percentages that add up to 100', () => {
    expect(
      initialMethodValues('percent', [me('60.00'), friend('36.00'), friend('24.00')], 120),
    ).toEqual(['50', '30', '20']);
    const thirds = initialMethodValues(
      'percent',
      [me('33.34'), friend('33.33'), friend('33.33')],
      100,
    );
    expect(methodValueSum([me(), friend(), friend()], thirds)).toBe(100);
  });

  it('splits percentages evenly when nothing is entered yet', () => {
    expect(initialMethodValues('percent', [me('0'), friend('0')], 0)).toEqual(['50', '50']);
  });

  it('starts everyone on one share', () => {
    expect(initialMethodValues('shares', [me('90.00'), friend('30.00')], 120)).toEqual(['1', '1']);
  });

  it('turns the current amounts into differences from an even split', () => {
    expect(
      initialMethodValues('adjust', [me('45.00'), friend('45.00'), friend('30.00')], 120),
    ).toEqual(['5', '5', '-10']);
    expect(initialMethodValues('adjust', [me('50.00'), friend('50.00')], 100)).toEqual(['0', '0']);
  });

  it('keeps the amounts it was given when applied back', () => {
    const rows = [me('70.10'), friend('19.95'), friend('9.95')];
    for (const method of ['percent', 'adjust'] as const) {
      const values = initialMethodValues(method, rows, 100);
      expect(amounts(applyMethodValues(method, rows, values, 100))).toEqual(amounts(rows));
    }
  });

  it('gives paid rows no value', () => {
    expect(initialMethodValues('shares', [me('10'), friend('5', true)], 10)).toEqual(['1', '']);
  });
});

describe('balanceSelfPercent', () => {
  it('gives Me what is left of 100 after a friend changes', () => {
    const rows = [me(), friend(), friend()];
    expect(balanceSelfPercent(rows, ['50', '30', '40'], 2)).toEqual(['30', '30', '40']);
  });

  it('never takes Me below 0', () => {
    expect(balanceSelfPercent([me(), friend()], ['50', '120'], 1)).toEqual(['0', '120']);
  });

  it('changes nothing else when Me is the one edited', () => {
    expect(balanceSelfPercent([me(), friend()], ['70', '50'], 0)).toEqual(['70', '50']);
  });
});

describe('splitMethodProblem', () => {
  it('reports percentages short of or over 100', () => {
    const rows = [me(), friend()];
    expect(splitMethodProblem('percent', rows, ['50', '30'])).toEqual({
      kind: 'percent',
      given: 80,
      diff: 20,
    });
    expect(splitMethodProblem('percent', rows, ['80', '30'])).toEqual({
      kind: 'percent',
      given: 110,
      diff: -10,
    });
    expect(splitMethodProblem('percent', rows, ['33.33', '66.67'])).toBeNull();
  });

  it('reports a bill with no shares', () => {
    expect(splitMethodProblem('shares', [me(), friend()], ['0', '0'])).toEqual({
      kind: 'no_shares',
    });
    expect(splitMethodProblem('shares', [me(), friend()], ['0', '1'])).toBeNull();
  });

  it('reports adjustments that leave someone below zero', () => {
    expect(splitMethodProblem('adjust', [me('-5.00'), friend('25.00')], ['0', '30'])).toEqual({
      kind: 'adjust_over',
    });
    expect(splitMethodProblem('adjust', [me('0.00'), friend('20.00')], ['-10', '10'])).toBeNull();
  });

  it('has nothing to say in amount mode', () => {
    expect(splitMethodProblem('amount', [me('1'), friend('1')], ['', ''])).toBeNull();
  });
});

describe('helpers', () => {
  it('trims numbers for value fields', () => {
    expect(trimNumber(50)).toBe('50');
    expect(trimNumber(33.333)).toBe('33.33');
    expect(trimNumber(-0)).toBe('0');
  });

  it('starts a new person on one share or nothing', () => {
    expect(defaultMethodValue('shares')).toBe('1');
    expect(defaultMethodValue('percent')).toBe('0');
    expect(defaultMethodValue('adjust')).toBe('0');
  });

  it('scales adjustments with tax and service', () => {
    expect(scaleAdjustments(['10', '-5', ''], 10)).toEqual(['11', '-5.5', '']);
  });
});
