import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { budgetTemplateCategoriesTable, budgetTemplatesTable } from '~/lib/db/schema';
import type { BudgetPeriod, BudgetTemplate, BudgetTemplateAllocation } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toBudgetTemplate, toBudgetTemplateAllocation } from './mappers';

export interface BudgetAllocationInput {
  categoryId: string;
  amount: number;
}

interface CreateBudgetTemplateInput {
  name: string;
  emoji: string | null;
  period: BudgetPeriod;
  totalAmount: number;
  countUnbudgeted: boolean;
  allocations: BudgetAllocationInput[];
}

class BudgetTemplatesRepository {
  list(): BudgetTemplate[] {
    const db = getDb();
    const templateRows = db
      .select()
      .from(budgetTemplatesTable)
      .where(and(isNull(budgetTemplatesTable.deletedAt), inActiveLedger(budgetTemplatesTable)))
      .orderBy(budgetTemplatesTable.sortOrder, budgetTemplatesTable.name)
      .all();
    if (templateRows.length === 0) return [];

    const allocationRows = db
      .select()
      .from(budgetTemplateCategoriesTable)
      .where(
        and(
          inArray(
            budgetTemplateCategoriesTable.templateId,
            templateRows.map((row) => row.id),
          ),
          isNull(budgetTemplateCategoriesTable.deletedAt),
        ),
      )
      .orderBy(budgetTemplateCategoriesTable.sortOrder)
      .all();

    const allocationsByTemplate = new Map<string, BudgetTemplateAllocation[]>();
    for (const row of allocationRows) {
      const list = allocationsByTemplate.get(row.templateId) ?? [];
      list.push(toBudgetTemplateAllocation(row));
      allocationsByTemplate.set(row.templateId, list);
    }

    return templateRows.map((row) =>
      toBudgetTemplate(row, allocationsByTemplate.get(row.id) ?? []),
    );
  }

  /** Creates a template; the first live template of its period becomes that period's default. */
  create(input: CreateBudgetTemplateInput): string {
    const db = getDb();
    const sqlite = getSQLite();
    const id = newId();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const maxSort = db
        .select({ maxSort: sql<number>`coalesce(max(${budgetTemplatesTable.sortOrder}), -1)` })
        .from(budgetTemplatesTable)
        .where(and(isNull(budgetTemplatesTable.deletedAt), inActiveLedger(budgetTemplatesTable)))
        .get();

      db.insert(budgetTemplatesTable)
        .values({
          id,
          ledgerId: getActiveLedgerId(),
          name: input.name,
          emoji: input.emoji,
          period: input.period,
          totalAmount: input.totalAmount,
          isDefault: false,
          countUnbudgeted: input.countUnbudgeted,
          sortOrder: (maxSort?.maxSort ?? -1) + 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();

      this.insertAllocations(id, input.allocations, now);
      this.normalizeDefaults(now);
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }

    return id;
  }

  /**
   * Updates name/period/total and replaces the allocation rows. Moving a
   * template to another period keeps each period with exactly one default.
   * Budgets already made from it keep their own period. No-ops when the
   * template is gone (soft-deleted from another path while an editor was
   * open) — inserting fresh allocation rows for a dead template would leave
   * live orphans behind.
   */
  update(id: string, input: CreateBudgetTemplateInput) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const existing = db
        .select({ id: budgetTemplatesTable.id, period: budgetTemplatesTable.period })
        .from(budgetTemplatesTable)
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .get();
      if (!existing) {
        sqlite.execSync('COMMIT');
        return;
      }

      db.update(budgetTemplatesTable)
        .set({
          name: input.name,
          emoji: input.emoji,
          period: input.period,
          // A template moving to another period leaves its default flag
          // behind: that period's own default stays (normalizeDefaults makes
          // it the default only when the period had none).
          ...(existing.period !== input.period ? { isDefault: false } : {}),
          totalAmount: input.totalAmount,
          countUnbudgeted: input.countUnbudgeted,
          updatedAt: now,
        })
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .run();

      db.update(budgetTemplateCategoriesTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(budgetTemplateCategoriesTable.templateId, id),
            isNull(budgetTemplateCategoriesTable.deletedAt),
          ),
        )
        .run();

      this.insertAllocations(id, input.allocations, now);
      this.normalizeDefaults(now);
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Atomically makes one template the default of its period. */
  setDefault(id: string) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const target = db
        .select({ period: budgetTemplatesTable.period })
        .from(budgetTemplatesTable)
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .get();
      if (!target) {
        sqlite.execSync('COMMIT');
        return;
      }
      db.update(budgetTemplatesTable)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(budgetTemplatesTable.isDefault, true),
            eq(budgetTemplatesTable.period, target.period),
            isNull(budgetTemplatesTable.deletedAt),
            inActiveLedger(budgetTemplatesTable),
          ),
        )
        .run();
      db.update(budgetTemplatesTable)
        .set({ isDefault: true, updatedAt: now })
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .run();
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Soft-deletes a template (and its allocations). If it was its period's
   * default, the next live template of that period by sort order is promoted
   * so a default always exists while the period has any template.
   */
  softDelete(id: string) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      db.update(budgetTemplatesTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .run();

      db.update(budgetTemplateCategoriesTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(budgetTemplateCategoriesTable.templateId, id),
            isNull(budgetTemplateCategoriesTable.deletedAt),
          ),
        )
        .run();

      this.normalizeDefaults(now);
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Category-delete cascade: drop the category's allocation from every template. */
  removeCategoryFromAllTemplates(categoryId: string) {
    const db = getDb();
    const now = nowIso();
    db.update(budgetTemplateCategoriesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(budgetTemplateCategoriesTable.categoryId, categoryId),
          isNull(budgetTemplateCategoriesTable.deletedAt),
        ),
      )
      .run();
  }

  /**
   * Must run inside a transaction. Leaves exactly one default per period that
   * has live templates: the first by sort order when none is marked, the
   * first marked one when several are (a template moved between periods can
   * bring its flag along).
   */
  private normalizeDefaults(now: string) {
    const db = getDb();
    const rows = db
      .select({
        id: budgetTemplatesTable.id,
        period: budgetTemplatesTable.period,
        isDefault: budgetTemplatesTable.isDefault,
      })
      .from(budgetTemplatesTable)
      .where(and(isNull(budgetTemplatesTable.deletedAt), inActiveLedger(budgetTemplatesTable)))
      .orderBy(budgetTemplatesTable.sortOrder, budgetTemplatesTable.name)
      .all();
    const byPeriod = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byPeriod.get(row.period) ?? [];
      list.push(row);
      byPeriod.set(row.period, list);
    }
    for (const list of byPeriod.values()) {
      const keep = list.find((row) => row.isDefault) ?? list[0];
      for (const row of list) {
        const shouldBeDefault = row.id === keep.id;
        if (row.isDefault === shouldBeDefault) continue;
        db.update(budgetTemplatesTable)
          .set({ isDefault: shouldBeDefault, updatedAt: now })
          .where(eq(budgetTemplatesTable.id, row.id))
          .run();
      }
    }
  }

  private insertAllocations(templateId: string, allocations: BudgetAllocationInput[], now: string) {
    const db = getDb();
    allocations.forEach((allocation, index) => {
      db.insert(budgetTemplateCategoriesTable)
        .values({
          id: newId(),
          templateId,
          categoryId: allocation.categoryId,
          amount: allocation.amount,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();
    });
  }
}

export const budgetTemplatesRepository = new BudgetTemplatesRepository();
