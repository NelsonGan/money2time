import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { monthlyBudgetCategoriesTable, monthlyBudgetsTable } from '~/lib/db/schema';
import type { BudgetTemplate, MonthlyBudget, MonthlyBudgetLine } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toMonthlyBudget, toMonthlyBudgetLine } from './mappers';

class MonthlyBudgetsRepository {
  list(): MonthlyBudget[] {
    const db = getDb();
    const budgetRows = db
      .select()
      .from(monthlyBudgetsTable)
      .where(isNull(monthlyBudgetsTable.deletedAt))
      .orderBy(monthlyBudgetsTable.month)
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

    const linesByBudget = new Map<string, MonthlyBudgetLine[]>();
    for (const row of lineRows) {
      const list = linesByBudget.get(row.budgetId) ?? [];
      list.push(toMonthlyBudgetLine(row));
      linesByBudget.set(row.budgetId, list);
    }

    return budgetRows.map((row) => toMonthlyBudget(row, linesByBudget.get(row.id) ?? []));
  }

  /**
   * Tombstone check for month-rollover auto-create: true when the month has or
   * ever had a budget (soft-deleted rows count, so deletion sticks).
   */
  hasEverExisted(month: string): boolean {
    const db = getDb();
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(monthlyBudgetsTable)
      .where(eq(monthlyBudgetsTable.month, month))
      .get();
    return (row?.count ?? 0) > 0;
  }

  /**
   * Months that have or ever had a budget (soft-deleted rows count). Used to
   * skip months during back-populate so a deliberately deleted month isn't
   * silently resurrected by a bulk fill — same tombstone rule as auto-create.
   */
  everExistedMonths(): string[] {
    const db = getDb();
    return db
      .selectDistinct({ month: monthlyBudgetsTable.month })
      .from(monthlyBudgetsTable)
      .all()
      .map((row) => row.month);
  }

  /**
   * Freezes the template into a budget row for the month. No-ops (returning
   * null) when the month already has a live budget, so a double-tap can't
   * create duplicates.
   */
  createFromTemplate(month: string, template: BudgetTemplate): string | null {
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      const id = this.insertFromTemplate(month, template);
      sqlite.execSync('COMMIT');
      return id;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Bulk back-populate: one transaction, skipping months with a live budget. */
  createManyFromTemplate(months: string[], template: BudgetTemplate): string[] {
    if (months.length === 0) return [];

    const sqlite = getSQLite();
    const created: string[] = [];
    sqlite.execSync('BEGIN');
    try {
      for (const month of months) {
        const id = this.insertFromTemplate(month, template);
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
   * Creates a one-off custom budget for the month: no source template, the
   * lines are exactly what the user entered. Returns null when the month
   * already has a live budget.
   */
  createCustom(
    month: string,
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
      const existing = db
        .select({ id: monthlyBudgetsTable.id })
        .from(monthlyBudgetsTable)
        .where(and(eq(monthlyBudgetsTable.month, month), isNull(monthlyBudgetsTable.deletedAt)))
        .get();
      if (existing) {
        sqlite.execSync('COMMIT');
        return null;
      }

      const id = newId();
      const now = nowIso();

      db.insert(monthlyBudgetsTable)
        .values({
          id,
          month,
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
   * Edits one month's frozen budget in place (total, options, and line rows).
   * Deliberately does not touch the source template: a month edit is a local
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

  /** Category-delete cascade: drop the category's line from every month. */
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

  /** Must run inside a transaction. Returns null when the month is taken. */
  private insertFromTemplate(month: string, template: BudgetTemplate): string | null {
    const db = getDb();
    const existing = db
      .select({ id: monthlyBudgetsTable.id })
      .from(monthlyBudgetsTable)
      .where(and(eq(monthlyBudgetsTable.month, month), isNull(monthlyBudgetsTable.deletedAt)))
      .get();
    if (existing) return null;

    const id = newId();
    const now = nowIso();

    db.insert(monthlyBudgetsTable)
      .values({
        id,
        month,
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

export const monthlyBudgetsRepository = new MonthlyBudgetsRepository();
