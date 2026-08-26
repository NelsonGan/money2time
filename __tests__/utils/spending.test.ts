import {
  asSpendingRow,
  countsAsExpenseRow,
  isCountedTransfer,
  toSpendingRows,
} from '~/utils/spending';

const expense = { type: 'expense' as const, countsAsExpense: false };
const income = { type: 'income' as const, countsAsExpense: false };
const transfer = { type: 'transfer' as const, countsAsExpense: false };
const countedTransfer = { type: 'transfer' as const, countsAsExpense: true };

describe('countsAsExpenseRow', () => {
  it('counts every expense', () => {
    expect(countsAsExpenseRow(expense)).toBe(true);
  });

  it('never counts income or a balance adjustment', () => {
    expect(countsAsExpenseRow(income)).toBe(false);
    expect(countsAsExpenseRow({ type: 'balance_adjustment', countsAsExpense: true })).toBe(false);
  });

  it('leaves an ordinary transfer out', () => {
    expect(countsAsExpenseRow(transfer)).toBe(false);
  });

  it('counts a stamped transfer', () => {
    expect(countsAsExpenseRow(countedTransfer)).toBe(true);
  });

  it('treats a missing flag as unstamped, so legacy rows never move totals', () => {
    expect(countsAsExpenseRow({ type: 'transfer' })).toBe(false);
    expect(countsAsExpenseRow({ type: 'transfer', countsAsExpense: null })).toBe(false);
  });
});

describe('isCountedTransfer', () => {
  it('separates a counted transfer from an ordinary expense', () => {
    expect(isCountedTransfer(countedTransfer)).toBe(true);
    expect(isCountedTransfer(expense)).toBe(false);
  });
});

describe('asSpendingRow', () => {
  it('reshapes a counted transfer into an expense on the funding account', () => {
    const row = asSpendingRow({
      type: 'transfer' as const,
      countsAsExpense: true,
      amount: 1250,
      accountId: null,
      fromAccountId: 'checking',
      toAccountId: 'car-loan',
      categoryId: 'bills',
    });
    expect(row.type).toBe('expense');
    expect(row.accountId).toBe('checking');
    // The loan side and the amount are untouched: the amount is already in the
    // funding account's currency, which is what an expense on it means.
    expect(row.toAccountId).toBe('car-loan');
    expect(row.amount).toBe(1250);
    expect(row.categoryId).toBe('bills');
  });

  it('carries the funding account name across when the row has relations', () => {
    const row = asSpendingRow({
      type: 'transfer' as const,
      countsAsExpense: true,
      accountId: null,
      accountName: null,
      fromAccountId: 'checking',
      fromAccountName: 'Checking',
    });
    expect(row.accountName).toBe('Checking');
  });

  it('leaves the account name alone on a row that has no relations', () => {
    const row = asSpendingRow({
      type: 'transfer' as const,
      countsAsExpense: true,
      accountId: null,
      fromAccountId: 'checking',
    });
    expect('accountName' in row).toBe(false);
  });

  it('returns every other row by identity', () => {
    expect(asSpendingRow(expense)).toBe(expense);
    expect(asSpendingRow(transfer)).toBe(transfer);
    expect(asSpendingRow(income)).toBe(income);
  });
});

describe('toSpendingRows', () => {
  it('returns the same array when there is nothing to reshape', () => {
    const rows = [expense, income, transfer];
    expect(toSpendingRows(rows)).toBe(rows);
  });

  it('reshapes only the counted transfers', () => {
    const rows = [expense, { ...countedTransfer, fromAccountId: 'checking' }, transfer];
    const result = toSpendingRows(rows);
    expect(result).not.toBe(rows);
    expect(result.map((row) => row.type)).toEqual(['expense', 'expense', 'transfer']);
    expect(result[0]).toBe(expense);
  });

  it('handles an empty list', () => {
    const rows: { type: string }[] = [];
    expect(toSpendingRows(rows)).toBe(rows);
  });
});
