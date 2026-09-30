import {
  amountKeyMatches,
  amountSearchKey,
  parseAmountQuery,
  transactionAmountSearchKeys,
} from '~/features/calendar/lib/amountSearch';
import type { TransactionWithRelations } from '~/types';

function matches(amount: number, query: string): boolean {
  const parsed = parseAmountQuery(query);
  return parsed !== null && amountKeyMatches(amountSearchKey(amount), parsed);
}

describe('parseAmountQuery', () => {
  it('reads plain whole and decimal numbers', () => {
    expect(parseAmountQuery('12')).toEqual({ whole: '12', fraction: null });
    expect(parseAmountQuery('12.5')).toEqual({ whole: '12', fraction: '5' });
    expect(parseAmountQuery('12.')).toEqual({ whole: '12', fraction: '' });
    expect(parseAmountQuery('.5')).toEqual({ whole: '0', fraction: '5' });
    expect(parseAmountQuery('007')).toEqual({ whole: '7', fraction: null });
  });

  it('drops grouping commas the list itself renders', () => {
    expect(parseAmountQuery('1,234')).toEqual({ whole: '1234', fraction: null });
    expect(parseAmountQuery('1,234.50')).toEqual({ whole: '1234', fraction: '50' });
  });

  it('reads a decimal comma', () => {
    expect(parseAmountQuery('12,50')).toEqual({ whole: '12', fraction: '50' });
    expect(parseAmountQuery('12,5')).toEqual({ whole: '12', fraction: '5' });
    expect(parseAmountQuery('1.234,50')).toEqual({ whole: '1234', fraction: '50' });
  });

  it('reads dot grouping, since three decimals is never an amount', () => {
    expect(parseAmountQuery('1.234')).toEqual({ whole: '1234', fraction: null });
    expect(parseAmountQuery('1.234.567')).toEqual({ whole: '1234567', fraction: null });
  });

  it('ignores a currency symbol, sign and spaces around the number', () => {
    expect(parseAmountQuery('$12.50')).toEqual({ whole: '12', fraction: '50' });
    expect(parseAmountQuery(' -12 ')).toEqual({ whole: '12', fraction: null });
    expect(parseAmountQuery('12 €')).toEqual({ whole: '12', fraction: null });
  });

  it('ignores a short currency code or prefix', () => {
    expect(parseAmountQuery('RM12.50')).toEqual({ whole: '12', fraction: '50' });
    expect(parseAmountQuery('rm 12')).toEqual({ whole: '12', fraction: null });
    expect(parseAmountQuery('S$12')).toEqual({ whole: '12', fraction: null });
    expect(parseAmountQuery('12 USD')).toEqual({ whole: '12', fraction: null });
  });

  it('rejects text, so it keeps searching notes only', () => {
    expect(parseAmountQuery('coffee')).toBeNull();
    expect(parseAmountQuery('7-eleven')).toBeNull();
    expect(parseAmountQuery('12 apples')).toBeNull();
    expect(parseAmountQuery('bus12abcd')).toBeNull();
    expect(parseAmountQuery('RM')).toBeNull();
    expect(parseAmountQuery('')).toBeNull();
    expect(parseAmountQuery('.')).toBeNull();
    expect(parseAmountQuery('$')).toBeNull();
    expect(parseAmountQuery('1.2.3')).toBeNull();
    expect(parseAmountQuery('12.3456')).toBeNull();
    expect(parseAmountQuery('0.123')).toBeNull();
  });
});

describe('amount matching', () => {
  it('matches a whole number against the integer part only', () => {
    expect(matches(12, '12')).toBe(true);
    expect(matches(12.99, '12')).toBe(true);
    expect(matches(120, '12')).toBe(false);
    expect(matches(112, '12')).toBe(false);
    expect(matches(1.2, '12')).toBe(false);
  });

  it('narrows by the cents typed so far', () => {
    expect(matches(12.5, '12.5')).toBe(true);
    expect(matches(12.55, '12.5')).toBe(true);
    expect(matches(12.05, '12.5')).toBe(false);
    expect(matches(12.5, '12.50')).toBe(true);
    expect(matches(12.55, '12.50')).toBe(false);
    expect(matches(12, '12.')).toBe(true);
    expect(matches(12, '12.00')).toBe(true);
  });

  it('matches large amounts typed with or without grouping', () => {
    expect(matches(1234.5, '1234.5')).toBe(true);
    expect(matches(1234.5, '1,234.50')).toBe(true);
    expect(matches(1234.5, '1.234,50')).toBe(true);
  });

  it('matches negative amounts by magnitude', () => {
    expect(matches(-40, '40')).toBe(true);
  });

  it('matches amounts below one', () => {
    expect(matches(0.5, '0.5')).toBe(true);
    expect(matches(0.5, '.5')).toBe(true);
    expect(matches(0.5, '0')).toBe(true);
  });
});

describe('transactionAmountSearchKeys', () => {
  const tx = (fields: Partial<TransactionWithRelations>) =>
    ({
      type: 'expense',
      currency: 'MYR',
      reportingCurrency: 'MYR',
      reportingAmount: null,
      ...fields,
    }) as TransactionWithRelations;

  it('keys the entered amount', () => {
    expect(transactionAmountSearchKeys(tx({ amount: 12.5 }))).toEqual(['12.50']);
  });

  it('adds the reporting amount a foreign-currency row also shows', () => {
    expect(
      transactionAmountSearchKeys(
        tx({ amount: 1000, currency: 'JPY', reportingAmount: 29.25, reportingCurrency: 'MYR' }),
      ),
    ).toEqual(['1000.00', '29.25']);
  });

  it('does not repeat an identical reporting amount', () => {
    expect(
      transactionAmountSearchKeys(
        tx({ amount: 12.5, currency: 'SGD', reportingAmount: 12.5, reportingCurrency: 'MYR' }),
      ),
    ).toEqual(['12.50']);
  });

  it('leaves out a reporting amount the row does not show', () => {
    const transfer = tx({
      type: 'transfer',
      amount: 100,
      currency: 'USD',
      reportingAmount: 470,
      reportingCurrency: 'MYR',
    });
    expect(transactionAmountSearchKeys(transfer)).toEqual(['100.00']);
    expect(transactionAmountSearchKeys(tx({ amount: 12.5, reportingAmount: 13 }))).toEqual([
      '12.50',
    ]);
  });
});
