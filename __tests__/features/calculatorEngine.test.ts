import {
  appendDecimal,
  appendDigit,
  appendOperator,
  evaluateExpression,
  formatMoney,
  sanitizeInitialAmount,
} from '~/features/transactions/components/editor/calculatorEngine';

describe('formatMoney', () => {
  it('formats finite values to two decimals', () => {
    expect(formatMoney(12)).toBe('12.00');
    expect(formatMoney(1.5)).toBe('1.50');
    expect(formatMoney(1.234)).toBe('1.23');
    expect(formatMoney(1.235)).toBe('1.24');
  });

  it('returns 0.00 for non-finite values', () => {
    expect(formatMoney(Number.NaN)).toBe('0.00');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('0.00');
  });

  it('normalizes -0 to 0.00', () => {
    expect(formatMoney(-0)).toBe('0.00');
  });
});

describe('sanitizeInitialAmount', () => {
  it('returns an empty string for blank input', () => {
    expect(sanitizeInitialAmount('')).toBe('');
  });

  it('returns an empty string for non-numeric input', () => {
    expect(sanitizeInitialAmount('abc')).toBe('');
  });

  it('formats a numeric string', () => {
    expect(sanitizeInitialAmount('12.5')).toBe('12.50');
  });
});

describe('evaluateExpression', () => {
  it('returns 0 for an empty expression', () => {
    expect(evaluateExpression('')).toBe(0);
  });

  it('trims trailing operators before evaluating', () => {
    expect(evaluateExpression('5+')).toBe(5);
    expect(evaluateExpression('5×')).toBe(5);
  });

  it('performs basic arithmetic', () => {
    expect(evaluateExpression('1+2')).toBe(3);
    expect(evaluateExpression('10-3')).toBe(7);
    expect(evaluateExpression('4×3')).toBe(12);
    expect(evaluateExpression('20÷4')).toBe(5);
  });

  it('honours multiplication-before-addition precedence', () => {
    expect(evaluateExpression('1+2×3')).toBe(7);
    expect(evaluateExpression('2×3+4')).toBe(10);
  });

  it('handles a leading minus as unary negation', () => {
    expect(evaluateExpression('-5+3')).toBe(-2);
    expect(evaluateExpression('-5')).toBe(-5);
  });

  it('returns 0 when dividing by zero', () => {
    expect(evaluateExpression('10÷0')).toBe(0);
  });

  it('normalizes the result to 2 decimal places', () => {
    expect(evaluateExpression('1÷3')).toBe(0.33);
  });

  it('chains multiple operators left-to-right', () => {
    expect(evaluateExpression('10-2-3')).toBe(5);
    expect(evaluateExpression('10÷2÷5')).toBe(1);
  });
});

describe('appendDigit', () => {
  it('appends digits to an empty expression', () => {
    expect(appendDigit('', '5')).toBe('5');
  });

  it('appends digits to an existing operand', () => {
    expect(appendDigit('1', '2')).toBe('12');
  });

  it('replaces a leading 0 operand', () => {
    expect(appendDigit('0', '5')).toBe('5');
  });

  it('replaces a leading -0 operand', () => {
    expect(appendDigit('-0', '5')).toBe('-5');
  });

  it('does not append a 3rd decimal digit', () => {
    expect(appendDigit('1.23', '4')).toBe('1.23');
  });

  it('allows the first two decimal digits', () => {
    expect(appendDigit('1.2', '3')).toBe('1.23');
  });

  it('only inspects the current operand for decimal places', () => {
    expect(appendDigit('1.23+5', '0')).toBe('1.23+50');
  });
});

describe('appendDecimal', () => {
  it('starts a new operand with 0.', () => {
    expect(appendDecimal('')).toBe('0.');
  });

  it('adds 0. after a trailing operator', () => {
    expect(appendDecimal('5+')).toBe('5+0.');
  });

  it('produces -0. when only a minus has been entered', () => {
    expect(appendDecimal('-')).toBe('-0.');
  });

  it('does not allow a second decimal in the same operand', () => {
    expect(appendDecimal('1.2')).toBe('1.2');
  });

  it('appends . to an existing whole number', () => {
    expect(appendDecimal('5')).toBe('5.');
  });

  it('treats the most recent operand for the decimal check', () => {
    expect(appendDecimal('1.5+2')).toBe('1.5+2.');
  });
});

describe('appendOperator', () => {
  it('returns an empty expression for non-minus operators when input is empty', () => {
    expect(appendOperator('', '+')).toBe('');
    expect(appendOperator('', '×')).toBe('');
  });

  it('allows a leading minus on empty input', () => {
    expect(appendOperator('', '-')).toBe('-');
  });

  it('replaces a trailing operator with the new one', () => {
    expect(appendOperator('5+', '×')).toBe('5×');
    expect(appendOperator('5-', '+')).toBe('5+');
  });

  it('appends an operator after a number', () => {
    expect(appendOperator('5', '+')).toBe('5+');
  });
});
