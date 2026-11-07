import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { monthlyBudgetCategoriesTable, monthlyBudgetsTable } from '~/lib/db/schema';
import type { BudgetPeriod, BudgetTemplate, PeriodBudget, PeriodBudgetLine } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { writeBudgetLines } from './budgetLines';
import { toPeriodBudget, toPeriodBudgetLine } from './mappers';

/**
 * The currency columns a period edit writes: none without a `currency` (or
 * for a budget that is gone); a main-currency budget needs no rate; a new
 * currency freezes the given rate; the same one keeps its frozen rate, or
 * takes the given one when it was made without.
 */
function periodCurrencyChange(
  existing: { currency: string | null; fxRate: number | null } | undefined,
  input: { currency?: string | null; fxRate?: number | null },
): { currency?: string | null; fxRate?: number | null } {
  if (!existing || input.currency === undefined) return {};
  if (input.currency === null) return { currency: null, fxRate: null };
  if (existing.currency === input.currency && existing.fxRate != null) return {};
  return { currency: input.currency, fxRate: input.fxRate ?? null };
}

/**
 * Week, month and year budgets (the `monthly_budgets` table, whose `month`
 * column holds the period key: see `features/budget/lib/budgetPeriods.ts`).
 */
class PeriodBudgetsRepository {
  list(): PeriodBudget[] {
    const db = getDb();
    const budgetRows = db
      .select()
      .from(monthlyBudgetsTable)
      .where(and(isNull(monthlyBudgetsTable.deletedAt), inActiveLedger(monthlyBudgetsTable)))
      .orderBy(monthlyBudgetsTable.period, monthlyBudgetsTable.month)
      .all();
    if (budgetRows.length === 0) return [];

    const lineRows = db
      .select()
      .from(monthlyBudgetCategoriesTable)
      .where(
        and(
          inArray(
            monthlyBudgetCategoriesTable.budgetId,
            budgetRows.map((row) => row.id),
          ),
          isNull(monthlyBudgetCategoriesTable.deletedAt),
        ),
      )
      .orderBy(monthlyBudgetCategoriesTable.sortOrder)
      .all();

    const linesByBudget = new Map<string, PeriodBudgetLine[]>();
    for (const row of lineRows) {
      const list = linesByBudget.get(row.budgetId) ?? [];
      list.push(toPeriodBudgetLine(row));
      linesByBudget.set(row.budgetId, list);
    }

    return budgetRows.map((row) => toPeriodBudget(row, linesByBudget.get(row.id) ?? []));
  }

  /**
   * Tombstone check for period-rollover auto-create: true when the period has
   * or ever had a budget (soft-deleted rows count, so deletion sticks).
   */
  hasEverExisted(period: BudgetPeriod, key: string): boolean {
    const db = getDb();
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(monthlyBudgetsTable)
      .where(
        and(
          eq(monthlyBudgetsTable.period, period),
          eq(monthlyBudgetsTable.month, key),
          inActiveLedger(monthlyBudgetsTable),
        ),
      )
      .get();
    return (row?.count ?? 0) > 0;
  }

  /**
   * Keys of `period` that have or ever had a budget (soft-deleted rows count).
   * Used to skip periods during back-populate so a deliberately deleted one
   * isn't silently resurrected by a bulk fill — same tombstone rule as
   * auto-create.
   */
  everExistedKeys(period: BudgetPeriod): string[] {
    const db = getDb();
    return db
      .selectDistinct({ month: monthlyBudgetsTable.month })
      .from(monthlyBudgetsTable)
      .where(and(eq(monthlyBudgetsTable.period, period), inActiveLedger(monthlyBudgetsTable)))
      .all()
      .map((row) => row.month);
  }

  /**
   * Freezes the template into a budget row for the period `key` of the
   * template's own period. No-ops (returning null) when that period already
   * has a live budget, so a double-tap can't create duplicates. `fxRate` is
   * the template currency's rate to freeze (`budgetRateToFreeze`).
   */
  createFromTemplate(key: string, template: BudgetTemplate, fxRate: number | null): string | null {
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      const id = this.insertFromTemplate(key, template, fxRate);
      sqlite.execSync('COMMIT');
      return id;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Bulk back-populate: one transaction, skipping periods with a live budget. */
  createManyFromTemplate(
    keys: string[],
    template: BudgetTemplate,
    fxRate: number | null,
  ): string[] {
    if (keys.length === 0) return [];

    const sqlite = getSQLite();
    const created: string[] = [];
    sqlite.execSync('BEGIN');
    try {
      for (const key of keys) {
        const id = this.insertFromTemplate(key, template, fxRate);
        if (id) created.push(id);
      }
      sqlite.execSync('COMMIT');
      return created;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Creates a one-off custom budget for one period: no source template, the
   * lines are exactly what the user entered. Returns null when the period
   * already has a live budget.
   */
  createCustom(
    period: BudgetPeriod,
    key: string,
    input: {
      totalAmount: number;
      countUnbudgeted: boolean;
      /** Null = the ledger's main currency. */
      currency: string | null;
      fxRate: number | null;
      lines: { categoryId: string; amount: number }[];
    },
  ): string | null {
    const db = getDb();
    const sqlite = getSQLite();

    sqlite.execSync('BEGIN');
    try {
      if (this.liveIdFor(period, key)) {
        sqlite.execSync('COMMIT');
        return null;
      }

      const id = newId();
      const now = nowIso();

      db.insert(monthlyBudgetsTable)
        .values({
          id,
          ledgerId: getActiveLedgerId(),
          period,
          month: key,
          templateId: null,
          templateName: null,
          templateEmoji: null,
          totalAmount: input.totalAmount,
          countUnbudgeted: input.countUnbudgeted,
          currency: input.currency,
          fxRate: input.currency ? input.fxRate : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();

      writeBudgetLines('monthly_budget_categories', id, input.lines, now);

      sqlite.execSync('COMMIT');
      return id;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Edits one period's frozen budget in place (total, options, and line rows).
   * Deliberately does not touch the source template: a period edit is a local
   * override, not a template change. A new `currency` freezes `fxRate` with
   * it; the same one keeps the frozen rate (or takes `fxRate` if the budget
   * was made without one). Without a `currency` (a Web Dashboard edit) both
   * stay as they are.
   */
  update(
    id: string,
    input: {
      totalAmount: number;
      countUnbudgeted: boolean;
      currency?: string | null;
      fxRate?: number | null;
      lines: { categoryId: string; amount: number }[];
    },
  ) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const existing = db
        .select({ currency: monthlyBudgetsTable.currency, fxRate: monthlyBudgetsTable.fxRate })
        .from(monthlyBudgetsTable)
        .where(and(eq(monthlyBudgetsTable.id, id), isNull(monthlyBudgetsTable.deletedAt)))
        .get();
      const currencyChange = periodCurrencyChange(existing, input);
      db.update(monthlyBudgetsTable)
        .set({
          totalAmount: input.totalAmount,
          countUnbudgeted: input.countUnbudgeted,
          ...currencyChange,
          updatedAt: now,
        })
        .where(and(eq(monthlyBudgetsTable.id, id), isNull(monthlyBudgetsTable.deletedAt)))
        .run();

      writeBudgetLines('monthly_budget_categories', id, input.lines, now);

      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Gives back the currency an older app version dropped. A version from
   * before budget currencies (another phone through Cloud Sync, or a shared
   * ledger's member) auto-creates a period from a ¥30,000 template as a
   * 30,000 budget with no currency, so it reads as RM30,000. Such a row is the
   * only one that is still exactly the template's copy (same total, never
   * edited, made after the template's last change) with no currency while
   * its template has one: this version always copies the currency, and an
   * edit or a template change since rules it out. Those rows get the
   * template's currency and today's rate (`rateFor`, which may be null until
   * a rate is known). Returns how many it repaired.
   */
  repairDroppedCurrencies(rateFor: (currency: string) => number | null): number {
    const sqlite = getSQLite();
    const rows = sqlite.getAllSync<{ id: string; currency: string }>(
      `SELECT b.id AS id, t.currency AS currency
         FROM monthly_budgets b
         JOIN budget_templates t ON t.id = b.template_id
        WHERE b.deleted_at IS NULL
          AND b.ledger_id = ?
          AND b.currency IS NULL
          AND b.updated_at = b.created_at
          AND t.deleted_at IS NULL
          AND t.currency IS NOT NULL
          AND t.updated_at <= b.created_at
          AND b.total_amount = t.total_amount`,
      [getActiveLedgerId()],
    );
    const now = nowIso();
    for (const row of rows) {
      sqlite.runSync(
        'UPDATE monthly_budgets SET currency = ?, fx_rate = ?, updated_at = ? WHERE id = ? AND currency IS NULL',
        [row.currency, rateFor(row.currency), now, row.id],
      );
    }
    return rows.length;
  }

  /**
   * Freezes a rate on live budgets in another currency that were made while no
   * rate for it was known (auto-create on a phone that had not downloaded any
   * rates yet). Until then such a budget follows each phone's latest rate, so
   * two phones could show it differently; once frozen it reads the same
   * everywhere and never moves again. `rateFor` returns 1 unit of a currency
   * in the main one, or null while there is still none. Returns how many
   * budgets it froze.
   */
  freezeMissingRates(rateFor: (currency: string) => number | null): number {
    const sqlite = getSQLite();
    const rows = sqlite.getAllSync<{ id: string; currency: string }>(
      `SELECT id, currency FROM monthly_budgets
        WHERE deleted_at IS NULL AND ledger_id = ? AND currency IS NOT NULL AND fx_rate IS NULL`,
      [getActiveLedgerId()],
    );
    const now = nowIso();
    let frozen = 0;
    for (const row of rows) {
      const rate = rateFor(row.currency);
      if (rate == null) continue;
      sqlite.runSync(
        'UPDATE monthly_budgets SET fx_rate = ?, updated_at = ? WHERE id = ? AND fx_rate IS NULL',
        [rate, now, row.id],
      );
      frozen += 1;
    }
    return frozen;
  }

  softDelete(id: string) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      db.update(monthlyBudgetsTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(monthlyBudgetsTable.id, id), isNull(monthlyBudgetsTable.deletedAt)))
        .run();

      db.update(monthlyBudgetCategoriesTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(monthlyBudgetCategoriesTable.budgetId, id),
            isNull(monthlyBudgetCategoriesTable.deletedAt),
          ),
        )
        .run();

      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Category-delete cascade: drop the category's line from every budget. */
  removeCategoryFromAllBudgets(categoryId: string) {
    const db = getDb();
    const now = nowIso();
    db.update(monthlyBudgetCategoriesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(monthlyBudgetCategoriesTable.categoryId, categoryId),
          isNull(monthlyBudgetCategoriesTable.deletedAt),
        ),
      )
      .run();
  }

  private liveIdFor(period: BudgetPeriod, key: string): string | null {
    const db = getDb();
    const existing = db
      .select({ id: monthlyBudgetsTable.id })
      .from(monthlyBudgetsTable)
      .where(
        and(
          eq(monthlyBudgetsTable.period, period),
          eq(monthlyBudgetsTable.month, key),
          isNull(monthlyBudgetsTable.deletedAt),
          inActiveLedger(monthlyBudgetsTable),
        ),
      )
      .get();
    return existing?.id ?? null;
  }

  /** Must run inside a transaction. Returns null when the period is taken. */
  private insertFromTemplate(
    key: string,
    template: BudgetTemplate,
    fxRate: number | null,
  ): string | null {
    const db = getDb();
    if (this.liveIdFor(template.period, key)) return null;

    const id = newId();
    const now = nowIso();

    db.insert(monthlyBudgetsTable)
      .values({
        id,
        ledgerId: getActiveLedgerId(),
        period: template.period,
        month: key,
        templateId: template.id,
        templateName: template.name,
        templateEmoji: template.emoji,
        totalAmount: template.totalAmount,
        countUnbudgeted: template.countUnbudgeted,
        currency: template.currency,
        fxRate: template.currency ? fxRate : null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();

    writeBudgetLines('monthly_budget_categories', id, template.allocations, now);

    return id;
  }
}

export const periodBudgetsRepository = new PeriodBudgetsRepository();
