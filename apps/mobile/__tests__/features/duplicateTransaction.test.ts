import {
  buildDuplicateInput,
  canDuplicateTransaction,
  dayKeyToTransactionDate,
  selectDuplicableTransactions,
} from '~/features/transactions/lib/duplicateTransaction';
import type { TransactionWithRelations } from '~/types';

function makeTransaction(
  overrides: Partial<TransactionWithRelations> = {},
): TransactionWithRelations {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 42.5,
    currency: 'EUR',
    reportingCurrency: 'MYR',
    reportingAmount: 210,
    fxRate: 4.94,
    toAmount: null,
    accountAmount: 208,
    date: new Date(2026, 2, 14).toISOString(),
    accountId: 'acc-1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'cat-1',
    note: 'Lunch',
    receiptUri: 'receipts/9f3c.jpg',
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'happy',
    reimbursable: true,
    reimbursedAt: '2026-03-20T00:00:00.000Z',
    reimbursementAccountId: 'acc-2',
    reimbursementTransactionId: 'tx-refund',
    reimbursementOfId: null,
    countsAsExpense: false,
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  } as TransactionWithRelations;
}

describe('canDuplicateTransaction', () => {
  it('refuses a balance adjustment', () => {
    expect(canDuplicateTransaction({ type: 'balance_adjustment' })).toBe(false);
  });

  it('accepts every other type', () => {
    expect(canDuplicateTransaction({ type: 'expense' })).toBe(true);
    expect(canDuplicateTransaction({ type: 'income' })).toBe(true);
    expect(canDuplicateTransaction({ type: 'transfer' })).toBe(true);
  });
});

describe('selectDuplicableTransactions', () => {
  const rows = [
    makeTransaction({ id: 'a' }),
    makeTransaction({ id: 'b', type: 'balance_adjustment' }),
    makeTransaction({ id: 'c', type: 'transfer' }),
  ];

  it('keeps the selected duplicable rows in list order', () => {
    expect(selectDuplicableTransactions(rows, ['c', 'a']).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('drops balance adjustments from the selection', () => {
    expect(selectDuplicableTransactions(rows, ['a', 'b']).map((t) => t.id)).toEqual(['a']);
  });

  it('returns nothing for an empty selection', () => {
    expect(selectDuplicableTransactions(rows, [])).toEqual([]);
  });
});

describe('dayKeyToTransactionDate', () => {
  it('writes local midnight of the picked day, the way the editor does', () => {
    expect(dayKeyToTransactionDate('2026-04-01')).toBe(new Date(2026, 3, 1).toISOString());
  });

  it('passes a value through when it is not a plain day key', () => {
    const iso = '2026-04-01T09:30:00.000Z';
    expect(dayKeyToTransactionDate(iso)).toBe(iso);
  });
});

describe('buildDuplicateInput', () => {
  it('copies the transaction onto the chosen date', () => {
    const input = buildDuplicateInput(makeTransaction(), '2026-04-01');
    expect(input).toEqual({
      type: 'expense',
      amount: 42.5,
      currency: 'EUR',
      toAmount: null,
      date: new Date(2026, 3, 1).toISOString(),
      accountId: 'acc-1',
      fromAccountId: null,
      toAccountId: null,
      categoryId: 'cat-1',
      note: 'Lunch',
      sentiment: 'happy',
      reimbursable: true,
      countsAsExpense: false,
    });
  });

  it('leaves the FX snapshot to be retaken at write time', () => {
    const input = buildDuplicateInput(makeTransaction(), '2026-04-01');
    expect(input.reportingCurrency).toBeUndefined();
    expect(input.reportingAmount).toBeUndefined();
    expect(input.fxRate).toBeUndefined();
    expect(input.accountAmount).toBeUndefined();
  });

  it('carries neither the receipt nor the reimbursement settlement', () => {
    const input = buildDuplicateInput(makeTransaction(), '2026-04-01');
    expect(input.receiptUri).toBeUndefined();
    expect(input.reimbursedAt).toBeUndefined();
    expect(input.reimbursementAccountId).toBeUndefined();
    expect(input.reimbursementTransactionId).toBeUndefined();
    expect(input.reimbursementOfId).toBeUndefined();
  });

  it("keeps a transfer's two accounts and its credited amount", () => {
    const input = buildDuplicateInput(
      makeTransaction({
        type: 'transfer',
        accountId: null,
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        toAmount: 190,
        countsAsExpense: true,
      }),
      '2026-04-01',
    );
    expect(input.fromAccountId).toBe('acc-1');
    expect(input.toAccountId).toBe('acc-2');
    expect(input.toAmount).toBe(190);
    expect(input.countsAsExpense).toBe(true);
  });
});
