// Budget currencies across app versions (README: Budgeting, Currencies). Runs
// the repository's SQL against a real in-memory SQLite.

import { DatabaseSync } from 'node:sqlite';

let db: DatabaseSync;
const flat = (args: unknown[]) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args);

jest.mock('~/lib/db/client', () => ({
  getDb: jest.fn(),
  getSQLite: () => ({
    getAllSync: (sql: string, ...args: unknown[]) => db.prepare(sql).all(...(flat(args) as [])),
    runSync: (sql: string, ...args: unknown[]) => db.prepare(sql).run(...(flat(args) as [])),
  }),
}));

import { periodBudgetsRepository } from '~/lib/repositories/periodBudgetsRepository';

const T0 = '2026-11-01T00:00:00.000Z';
const T1 = '2026-12-01T00:00:00.000Z';

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE budget_templates (id TEXT PRIMARY KEY, total_amount REAL, currency TEXT,
      updated_at TEXT, deleted_at TEXT);
    CREATE TABLE monthly_budgets (id TEXT PRIMARY KEY, ledger_id TEXT, template_id TEXT,
      total_amount REAL, currency TEXT, fx_rate REAL, created_at TEXT, updated_at TEXT,
      deleted_at TEXT);
    INSERT INTO budget_templates VALUES ('jpy', 30000, 'JPY', '${T0}', NULL);
    INSERT INTO budget_templates VALUES ('myr', 500, NULL, '${T0}', NULL);
  `);
});

function addBudget(values: {
  id: string;
  template?: string | null;
  total?: number;
  currency?: string | null;
  fxRate?: number | null;
  createdAt?: string;
  updatedAt?: string;
  ledger?: string;
}) {
  const createdAt = values.createdAt ?? T1;
  db.prepare('INSERT INTO monthly_budgets VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
    values.id,
    values.ledger ?? 'default',
    values.template === undefined ? 'jpy' : values.template,
    values.total ?? 30000,
    values.currency ?? null,
    values.fxRate ?? null,
    createdAt,
    values.updatedAt ?? createdAt,
  );
}

const budget = (id: string) =>
  db.prepare('SELECT currency, fx_rate AS fxRate FROM monthly_budgets WHERE id = ?').get(id);
const rateFor = (currency: string) => (currency === 'JPY' ? 0.03 : null);

describe('repairDroppedCurrencies', () => {
  it("gives back the template's currency an older version dropped", () => {
    // An older version auto-created December from the ¥30,000 template.
    addBudget({ id: 'dec' });
    expect(periodBudgetsRepository.repairDroppedCurrencies(rateFor)).toBe(1);
    expect(budget('dec')).toEqual({ currency: 'JPY', fxRate: 0.03 });
  });

  it('leaves a budget the user edited, one with another total, and a main-currency one', () => {
    addBudget({ id: 'edited', updatedAt: '2026-12-02T00:00:00.000Z' });
    addBudget({ id: 'other-total', total: 25000 });
    addBudget({ id: 'main', template: 'myr', total: 500 });
    addBudget({ id: 'custom', template: null });
    expect(periodBudgetsRepository.repairDroppedCurrencies(rateFor)).toBe(0);
    for (const id of ['edited', 'other-total', 'main', 'custom']) {
      expect(budget(id)).toEqual({ currency: null, fxRate: null });
    }
  });

  it('leaves a budget made before its template switched to another currency', () => {
    db.exec(`UPDATE budget_templates SET updated_at = '2026-12-15T00:00:00.000Z' WHERE id = 'jpy'`);
    addBudget({ id: 'dec' });
    expect(periodBudgetsRepository.repairDroppedCurrencies(rateFor)).toBe(0);
    expect(budget('dec')).toEqual({ currency: null, fxRate: null });
  });

  it('only touches the open ledger', () => {
    addBudget({ id: 'elsewhere', ledger: 'shared' });
    expect(periodBudgetsRepository.repairDroppedCurrencies(rateFor)).toBe(0);
  });
});

describe('freezeMissingRates', () => {
  it('freezes a rate on a budget made while none was known', () => {
    addBudget({ id: 'dec', currency: 'JPY' });
    addBudget({ id: 'sgd', currency: 'SGD' });
    addBudget({ id: 'frozen', currency: 'JPY', fxRate: 0.031 });
    expect(periodBudgetsRepository.freezeMissingRates(rateFor)).toBe(1);
    expect(budget('dec')).toEqual({ currency: 'JPY', fxRate: 0.03 });
    // Still no SGD rate: left for the next refresh.
    expect(budget('sgd')).toEqual({ currency: 'SGD', fxRate: null });
    // An already frozen rate never moves.
    expect(budget('frozen')).toEqual({ currency: 'JPY', fxRate: 0.031 });
  });
});
