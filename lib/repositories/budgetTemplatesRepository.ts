import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { budgetTemplateCategoriesTable, budgetTemplatesTable } from '~/lib/db/schema';
import type { BudgetTemplate, BudgetTemplateAllocation } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toBudgetTemplate, toBudgetTemplateAllocation } from './mappers';

export interface BudgetAllocationInput {
  categoryId: string;
  amount: number;
}

interface CreateBudgetTemplateInput {
  name: string;
  emoji: string | null;
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
      .where(isNull(budgetTemplatesTable.deletedAt))
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

  /** Creates a template; the first live template is forced to be the default. */
  create(input: CreateBudgetTemplateInput): string {
    const db = getDb();
    const sqlite = getSQLite();
    const id = newId();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const liveCount = db
        .select({ count: sql<number>`count(*)` })
        .from(budgetTemplatesTable)
        .where(isNull(budgetTemplatesTable.deletedAt))
        .get();
      const maxSort = db
        .select({ maxSort: sql<number>`coalesce(max(${budgetTemplatesTable.sortOrder}), -1)` })
        .from(budgetTemplatesTable)
        .where(isNull(budgetTemplatesTable.deletedAt))
        .get();

      db.insert(budgetTemplatesTable)
        .values({
          id,
          name: input.name,
          emoji: input.emoji,
          totalAmount: input.totalAmount,
          isDefault: (liveCount?.count ?? 0) === 0,
          countUnbudgeted: input.countUnbudgeted,
          sortOrder: (maxSort?.maxSort ?? -1) + 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .run();

      this.insertAllocations(id, input.allocations, now);
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }

    return id;
  }

  /** Updates name/total and replaces the allocation rows. */
  update(id: string, input: CreateBudgetTemplateInput) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      db.update(budgetTemplatesTable)
        .set({
          name: input.name,
          emoji: input.emoji,
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
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Atomically makes one template the default. */
  setDefault(id: string) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      db.update(budgetTemplatesTable)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(eq(budgetTemplatesTable.isDefault, true), isNull(budgetTemplatesTable.deletedAt)),
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
   * Soft-deletes a template (and its allocations). If it was the default, the
   * next live template by sort order is promoted so a default always exists
   * while any template does.
   */
  softDelete(id: string) {
    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      const wasDefault = db
        .select({ isDefault: budgetTemplatesTable.isDefault })
        .from(budgetTemplatesTable)
        .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
        .get();

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

      if (wasDefault?.isDefault) {
        const next = db
          .select({ id: budgetTemplatesTable.id })
          .from(budgetTemplatesTable)
          .where(isNull(budgetTemplatesTable.deletedAt))
          .orderBy(budgetTemplatesTable.sortOrder, budgetTemplatesTable.name)
          .get();
        if (next) {
          db.update(budgetTemplatesTable)
            .set({ isDefault: true, updatedAt: now })
            .where(eq(budgetTemplatesTable.id, next.id))
            .run();
        }
      }

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

  reorder(ids: string[]) {
    if (ids.length === 0) return;

    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      ids.forEach((id, index) => {
        db.update(budgetTemplatesTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(budgetTemplatesTable.id, id), isNull(budgetTemplatesTable.deletedAt)))
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
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
