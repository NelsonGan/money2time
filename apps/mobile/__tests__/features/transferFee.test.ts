import {
  buildTransferFeeIndex,
  canChargeTransferFee,
  defaultTransferFeeCategoryId,
  defaultTransferFeeSide,
  EMPTY_TRANSFER_FEE_INDEX,
  indexTransferFees,
  isTransferFee,
  planTransferFeeWrite,
  sameTransferFeeIndex,
  transferFeeAccountId,
  transferFeeCreatedAt,
  transferFeeDayOrder,
  transferFeeDraftOf,
  transferFeePercentOf,
  transferFeeSideOf,
  transferFeeTotals,
} from '~/features/transactions/lib/transferFee';
import { sortTransactions } from '~/utils/transactionSorting';

const transfer = {
  id: 'tr1',
  date: '2026-11-08T06:30:00.000Z',
  fromAccountId: 'card',
  toAccountId: 'wallet',
};

const currencies: Record<string, string> = { card: 'MYR', wallet: 'MYR', usd: 'USD' };
const currencyOf = (id: string) => currencies[id] ?? 'MYR';

function feeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fee1',
    type: 'expense' as const,
    amount: 2,
    currency: 'MYR',
    accountId: 'card',
    categoryId: 'bank-fees',
    date: transfer.date,
    feeOfId: 'tr1',
    deletedAt: null,
    ...overrides,
  };
}

describe('isTransferFee / indexTransferFees', () => {
  it('reads only live expense rows that point at a transfer', () => {
    expect(isTransferFee(feeRow())).toBe(true);
    expect(isTransferFee(feeRow({ feeOfId: null }))).toBe(false);
    expect(isTransferFee(feeRow({ type: 'income' }))).toBe(false);
    expect(isTransferFee(feeRow({ deletedAt: '2026-11-08T07:00:00.000Z' }))).toBe(false);
  });

  it('indexes each transfer to its first fee row', () => {
    const first = feeRow();
    const duplicate = feeRow({ id: 'fee2' });
    const other = feeRow({ id: 'fee3', feeOfId: 'tr2' });
    const index = indexTransferFees([first, duplicate, other, feeRow({ id: 'x', feeOfId: null })]);
    expect(index.get('tr1')).toBe(first);
    expect(index.get('tr2')).toBe(other);
    expect(index.size).toBe(2);
  });
});

describe('fee side', () => {
  it('reads the side from the account the fee is on', () => {
    expect(transferFeeSideOf(transfer, { accountId: 'card' })).toBe('from');
    expect(transferFeeSideOf(transfer, { accountId: 'wallet' })).toBe('to');
    // An account the transfer no longer has reads as the paying side.
    expect(transferFeeSideOf(transfer, { accountId: 'elsewhere' })).toBe('from');
  });

  it('maps a side back to its account', () => {
    expect(transferFeeAccountId('from', transfer)).toBe('card');
    expect(transferFeeAccountId('to', transfer)).toBe('wallet');
    expect(transferFeeAccountId('to', { fromAccountId: 'card', toAccountId: null })).toBeNull();
  });

  it('builds the editor draft for a saved fee', () => {
    expect(transferFeeDraftOf(transfer, feeRow({ accountId: 'wallet', amount: 1.5 }))).toEqual({
      amount: 1.5,
      side: 'to',
      categoryId: 'bank-fees',
    });
  });
});

describe('amounts', () => {
  it('takes a percentage to the cent', () => {
    expect(transferFeePercentOf(200, 1)).toBe(2);
    expect(transferFeePercentOf(123.45, 1.5)).toBe(1.85);
    expect(transferFeePercentOf(0, 1)).toBe(0);
  });

  it('adds a from-side fee to what leaves, and takes a to-side fee off what arrives', () => {
    expect(transferFeeTotals({ amount: 200, received: 200, fee: 2, side: 'from' })).toEqual({
      leaves: 202,
      arrives: 200,
    });
    expect(transferFeeTotals({ amount: 200, received: 200, fee: 2, side: 'to' })).toEqual({
      leaves: 200,
      arrives: 198,
    });
    // Across currencies each side stays in its own currency.
    expect(transferFeeTotals({ amount: 100, received: 21.5, fee: 0.5, side: 'to' })).toEqual({
      leaves: 100,
      arrives: 21,
    });
  });
});

describe('defaultTransferFeeCategoryId', () => {
  const categories = [
    { id: 'food', name: 'Food', type: 'expense' as const, parentId: null, deletedAt: null },
    { id: 'bills', name: 'Bills', type: 'expense' as const, parentId: null, deletedAt: null },
    { id: 'salary', name: 'Fees earned', type: 'income' as const, parentId: null, deletedAt: null },
  ];

  it('reuses the category the last fee was filed under', () => {
    expect(
      defaultTransferFeeCategoryId({
        categories,
        latestCategoryId: 'food',
        fallbackCategoryId: 'bills',
      }),
    ).toBe('food');
  });

  it('prefers an expense category named for fees', () => {
    expect(
      defaultTransferFeeCategoryId({
        categories: [
          ...categories,
          { id: 'fees', name: 'Bank Fees', type: 'expense', parentId: null, deletedAt: null },
        ],
        fallbackCategoryId: 'bills',
      }),
    ).toBe('fees');
  });

  it('finds a fee category whose name ends in a non-ASCII letter', () => {
    expect(
      defaultTransferFeeCategoryId({
        categories: [
          ...categories,
          { id: 'phi', name: 'Phí ngân hàng', type: 'expense', parentId: null, deletedAt: null },
        ],
        fallbackCategoryId: 'bills',
      }),
    ).toBe('phi');
  });

  it('falls back to the given category, then the first expense category', () => {
    expect(defaultTransferFeeCategoryId({ categories, fallbackCategoryId: 'bills' })).toBe('bills');
    expect(defaultTransferFeeCategoryId({ categories })).toBe('food');
    expect(defaultTransferFeeCategoryId({ categories: [] })).toBeNull();
  });

  it('skips a deleted category the last fee used', () => {
    expect(
      defaultTransferFeeCategoryId({
        categories,
        latestCategoryId: 'gone',
        fallbackCategoryId: 'bills',
      }),
    ).toBe('bills');
  });
});

describe('planTransferFeeWrite', () => {
  const note = 'Transfer fee';
  const draft = { amount: 2, side: 'from' as const, categoryId: 'bank-fees' };

  it('writes nothing without a fee, and creates one when a fee is added', () => {
    expect(
      planTransferFeeWrite({ transfer, draft: null, existing: null, currencyOf, note }),
    ).toEqual({ kind: 'none' });
    expect(
      planTransferFeeWrite({
        transfer: { ...transfer, memberId: 'm1' },
        draft,
        existing: null,
        currencyOf,
        note,
      }),
    ).toEqual({
      kind: 'create',
      input: {
        type: 'expense',
        amount: 2,
        currency: 'MYR',
        date: transfer.date,
        accountId: 'card',
        fromAccountId: null,
        toAccountId: null,
        categoryId: 'bank-fees',
        note,
        sentiment: 'neutral',
        reimbursable: false,
        feeOfId: 'tr1',
        memberId: 'm1',
      },
    });
  });

  it('charges a to-side fee to the to account, in its currency', () => {
    const plan = planTransferFeeWrite({
      transfer: { ...transfer, toAccountId: 'usd' },
      draft: { ...draft, side: 'to', amount: 0.5 },
      existing: null,
      currencyOf,
      note,
    });
    expect(plan.kind === 'create' && plan.input).toMatchObject({
      accountId: 'usd',
      currency: 'USD',
      amount: 0.5,
    });
  });

  it('removes the fee when it is cleared, zeroed or its account is gone', () => {
    const existing = feeRow();
    expect(planTransferFeeWrite({ transfer, draft: null, existing, currencyOf, note })).toEqual({
      kind: 'delete',
      feeId: 'fee1',
    });
    expect(
      planTransferFeeWrite({
        transfer,
        draft: { ...draft, amount: 0 },
        existing,
        currencyOf,
        note,
      }),
    ).toEqual({ kind: 'delete', feeId: 'fee1' });
    expect(
      planTransferFeeWrite({
        transfer: { ...transfer, toAccountId: null },
        draft: { ...draft, side: 'to' },
        existing,
        currencyOf,
        note,
      }),
    ).toEqual({ kind: 'delete', feeId: 'fee1' });
  });

  it('updates only what changed, and follows the transfer to a new day', () => {
    const existing = feeRow();
    expect(planTransferFeeWrite({ transfer, draft, existing, currencyOf, note })).toEqual({
      kind: 'none',
    });
    expect(
      planTransferFeeWrite({
        transfer: { ...transfer, date: '2026-11-07T06:30:00.000Z' },
        draft: { ...draft, amount: 3 },
        existing,
        currencyOf,
        note,
      }),
    ).toEqual({
      kind: 'update',
      feeId: 'fee1',
      input: { amount: 3, date: '2026-11-07T06:30:00.000Z' },
    });
    expect(
      planTransferFeeWrite({
        transfer: { ...transfer, toAccountId: 'usd' },
        draft: { ...draft, side: 'to' },
        existing,
        currencyOf,
        note,
      }),
    ).toEqual({
      kind: 'update',
      feeId: 'fee1',
      input: { amount: 2, currency: 'USD', accountId: 'usd' },
    });
  });
});

describe('fee ordering', () => {
  it('sorts the fee right under its transfer', () => {
    const base = { amount: 1, date: transfer.date };
    const transferRow = { ...base, id: 'b', createdAt: '2026-11-08T06:30:00.500Z' };
    const fee = { ...base, id: 'z', createdAt: transferFeeCreatedAt(transferRow.createdAt) };
    const before = { ...base, id: 'a', createdAt: '2026-11-08T06:29:00.000Z' };
    const after = { ...base, id: 'c', createdAt: '2026-11-08T06:31:00.000Z' };
    expect(
      sortTransactions([fee, before, after, transferRow], 'date_desc').map((row) => row.id),
    ).toEqual(['c', 'b', 'z', 'a']);
  });

  it('keeps a dragged transfer and its fee together', () => {
    expect(transferFeeDayOrder(null)).toBeNull();
    expect(transferFeeDayOrder(1_000)).toBe(999);
  });
});

describe('buildTransferFeeIndex', () => {
  it('links each transfer and its fee both ways, and compares by content', () => {
    const rows = [feeRow(), feeRow({ id: 'fee9', feeOfId: 'tr9', accountId: 'wallet' })];
    const index = buildTransferFeeIndex(rows);
    expect(index.byTransferId.get('tr1')).toEqual({
      feeId: 'fee1',
      transferId: 'tr1',
      amount: 2,
      currency: 'MYR',
      accountId: 'card',
      categoryId: 'bank-fees',
    });
    expect(index.byFeeId.get('fee9')?.transferId).toBe('tr9');
    expect(index.latestCategoryId).toBe('bank-fees');
    expect(sameTransferFeeIndex(index, buildTransferFeeIndex(rows))).toBe(true);
    expect(
      sameTransferFeeIndex(index, buildTransferFeeIndex([feeRow({ amount: 3 }), rows[1]!])),
    ).toBe(false);
    expect(buildTransferFeeIndex([])).toBe(EMPTY_TRANSFER_FEE_INDEX);
  });
});

describe('which account can pay a fee', () => {
  it('never charges a loan, whose balance is walked from its repayments', () => {
    expect(canChargeTransferFee({ type: 'credit' })).toBe(true);
    expect(canChargeTransferFee({ type: 'goal' })).toBe(true);
    expect(canChargeTransferFee({ type: 'loan' })).toBe(false);
    expect(canChargeTransferFee(null)).toBe(false);
  });

  it('starts on the from account unless only the to account can pay', () => {
    expect(defaultTransferFeeSide({ type: 'debit' }, { type: 'loan' })).toBe('from');
    expect(defaultTransferFeeSide({ type: 'loan' }, { type: 'debit' })).toBe('to');
    expect(defaultTransferFeeSide(null, null)).toBe('from');
  });
});
