// Archiving an everyday account pauses the rules that touch it (README:
// Archived accounts). Drizzle is mocked repo-wide, so here its operators build
// row predicates instead of SQL and the WHERE clause runs against plain rows.

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

jest.mock('drizzle-orm', () => ({
  and:
    (...parts: Predicate[]) =>
    (row: Row) =>
      parts.every((part) => part == null || part(row)),
  or:
    (...parts: Predicate[]) =>
    (row: Row) =>
      parts.some((part) => part(row)),
  eq: (column: string, value: unknown) => (row: Row) => row[column] === value,
  isNull: (column: string) => (row: Row) => row[column] == null,
  gte: jest.fn(),
  lt: jest.fn(),
  lte: jest.fn(),
}));
jest.mock('~/lib/db/schema', () => ({
  accountsTable: {},
  transactionsTable: {},
  recurringRulesTable: {
    type: 'type',
    accountId: 'accountId',
    fromAccountId: 'fromAccountId',
    toAccountId: 'toAccountId',
    isActive: 'isActive',
    deletedAt: 'deletedAt',
    instalmentCount: 'instalmentCount',
  },
}));
jest.mock('~/lib/db/client', () => ({ getDb: jest.fn(), getSQLite: jest.fn() }));

import { getDb } from '~/lib/db/client';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';

function useRules(rules: Row[]) {
  const rows: Row[] = rules.map((rule) => ({ isActive: true, deletedAt: null, ...rule }));
  (getDb as jest.Mock).mockReturnValue({
    update: () => ({
      set: (values: Row) => ({
        where: (matches: Predicate) => ({
          run: () => rows.filter(matches).forEach((row) => Object.assign(row, values)),
        }),
      }),
    }),
  });
  return () => Object.fromEntries(rows.map((row) => [row.id, row.isActive]));
}

describe('recurringRulesRepository.deactivateRulesForAccount', () => {
  it('pauses rules on the account and transfers either way, and nothing else', () => {
    const active = useRules([
      { id: 'subscription', type: 'expense', accountId: 'card' },
      { id: 'salary', type: 'income', accountId: 'card' },
      { id: 'pay-card', type: 'transfer', fromAccountId: 'cash', toAccountId: 'card' },
      { id: 'move-out', type: 'transfer', fromAccountId: 'card', toAccountId: 'cash' },
      { id: 'other', type: 'expense', accountId: 'cash' },
      { id: 'other-transfer', type: 'transfer', fromAccountId: 'cash', toAccountId: 'goal' },
    ]);
    recurringRulesRepository.deactivateRulesForAccount('card');
    expect(active()).toEqual({
      subscription: false,
      salary: false,
      'pay-card': false,
      'move-out': false,
      other: true,
      'other-transfer': true,
    });
  });

  it('keeps instalment plans on the account running', () => {
    const active = useRules([
      { id: 'phone-plan', type: 'expense', accountId: 'card', instalmentCount: 12 },
    ]);
    recurringRulesRepository.deactivateRulesForAccount('card');
    expect(active()).toEqual({ 'phone-plan': true });
  });

  it('still pauses only transfers into an archived goal or loan', () => {
    const active = useRules([
      { id: 'auto-save', type: 'transfer', fromAccountId: 'cash', toAccountId: 'goal' },
      { id: 'withdraw', type: 'transfer', fromAccountId: 'goal', toAccountId: 'cash' },
    ]);
    recurringRulesRepository.deactivateTransfersInto('goal');
    expect(active()).toEqual({ 'auto-save': false, withdraw: true });
  });

  it('leaves deleted rules as they were', () => {
    const active = useRules([
      { id: 'gone', type: 'expense', accountId: 'card', deletedAt: 'then' },
    ]);
    recurringRulesRepository.deactivateRulesForAccount('card');
    expect(active()).toEqual({ gone: true });
  });
});
