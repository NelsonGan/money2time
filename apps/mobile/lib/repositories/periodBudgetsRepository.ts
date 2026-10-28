import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { monthlyBudgetCategoriesTable, monthlyBudgetsTable } from '~/lib/db/schema';
import type { BudgetPeriod, BudgetTemplate, PeriodBudget, PeriodBudgetLine } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toPeriodBudget, toPeriodBudgetLine } from './mappers';

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
      .where(isNull(monthlyBudgetsTable.deletedAt))
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
      .where(and(eq(monthlyBudgetsTable.period, period), eq(monthlyBudgetsTable.month, key)))
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
      .where(eq(monthlyBudgetsTable.period, period))
      .all()
      .map((row) => row.month);
  }

  /**
   * Freezes the template into a budget row for the period `key` of the
   * template's own period. No-ops (returning null) when that period already
   * has a live budget, so a double-tap can't create duplicates.
   */
  createFromTemplate(key: string, template: BudgetTemplate): string | null {
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      const id = this.insertFromTemplate(key, template);
      sqlite.execSync('COMMIT');
      return id;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Bulk back-populate: one transaction, skipping periods with a live budget. */
  createManyFromTemplate(keys: string[], template: BudgetTemplate): string[] {
    if (keys.length === 0) return [];

    const sqlite = getSQLite();
    const created: string[] = [];
    sqlite.execSync('BEGIN');
    try {
      for (const key of keys) {
        const id = this.insertFromTemplate(key, template);
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
          period,
          month: key,
          templateId: null,
          templateName: null,
          templateEmoji: null,
          totalAmount: input.totalAmount,
          countUnbudgeted: input.countUnbudgeted,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();

      input.lines.forEach((line, index) => {
        db.insert(monthlyBudgetCategoriesTable)
          .values({
            id: newId(),
            budgetId: id,
            categoryId: line.categoryId,
            amount: line.amount,
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .run();
      });

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
   * override, not a template change.
   */
  update(
    id: string,
    input: {
      totalAmount: number;
      countUnbudgeted: boolean;
      lines: { categoryId: string; amount: number }[];
    },
  ) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      db.update(monthlyBudgetsTable)
        .set({
          totalAmount: input.totalAmount,
          countUnbudgeted: input.countUnbudgeted,
          updatedAt: now,
        })
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

      input.lines.forEach((line, index) => {
        db.insert(monthlyBudgetCategoriesTable)
          .values({
            id: newId(),
            budgetId: id,
            categoryId: line.categoryId,
            amount: line.amount,
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .run();
      });

      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
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
        ),
      )
      .get();
    return existing?.id ?? null;
  }

  /** Must run inside a transaction. Returns null when the period is taken. */
  private insertFromTemplate(key: string, template: BudgetTemplate): string | null {
    const db = getDb();
    if (this.liveIdFor(template.period, key)) return null;

    const id = newId();
    const now = nowIso();

    db.insert(monthlyBudgetsTable)
      .values({
        id,
        period: template.period,
        month: key,
        templateId: template.id,
        templateName: template.name,
        templateEmoji: template.emoji,
        totalAmount: template.totalAmount,
        countUnbudgeted: template.countUnbudgeted,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();

    template.allocations.forEach((allocation, index) => {
      db.insert(monthlyBudgetCategoriesTable)
        .values({
          id: newId(),
          budgetId: id,
          categoryId: allocation.categoryId,
          amount: allocation.amount,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();
    });

    return id;
  }
}

export const periodBudgetsRepository = new PeriodBudgetsRepository();
