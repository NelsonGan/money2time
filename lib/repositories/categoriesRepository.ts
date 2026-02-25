import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { categoriesTable } from '~/lib/db/schema';
import type { Category } from '~/types';
import { newId, nowIso } from '~/utils/id';
import { toCategory } from './mappers';

interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
  type: Category['type'];
  parentId: string | null;
  icon: string;
  color: string;
  isDefault?: boolean;
  deletedAt?: string | null;
}

class CategoriesRepository {
  list(type?: Category['type']): Category[] {
    const db = getDb();
    return db
      .select()
      .from(categoriesTable)
      .where(
        and(isNull(categoriesTable.deletedAt), type ? eq(categoriesTable.type, type) : undefined),
      )
      .orderBy(categoriesTable.sortOrder, categoriesTable.name)
      .all()
      .map(toCategory);
  }

  listForTransactionType(txType: 'expense' | 'income') {
    return this.list(txType);
  }

  getById(id: string) {
    const db = getDb();
    const row = db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, id), isNull(categoriesTable.deletedAt)))
      .get();
    return row ? toCategory(row) : null;
  }

  create(input: CreateCategoryInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const maxSort = db
      .select({ maxSort: sql<number>`coalesce(max(${categoriesTable.sortOrder}), -1)` })
      .from(categoriesTable)
      .where(and(isNull(categoriesTable.deletedAt), eq(categoriesTable.type, input.type)))
      .get();
    const nextSortOrder = input.sortOrder ?? (maxSort?.maxSort ?? -1) + 1;

    db.insert(categoriesTable)
      .values({
        id,
        name: input.name,
        sortOrder: nextSortOrder,
        type: input.type,
        parentId: input.parentId,
        icon: input.icon,
        color: input.color,
        isDefault: input.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, updates: Partial<CreateCategoryInput>) {
    const db = getDb();
    db.update(categoriesTable)
      .set({ ...updates, updatedAt: nowIso() })
      .where(and(eq(categoriesTable.id, id), isNull(categoriesTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(categoriesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          or(eq(categoriesTable.id, id), eq(categoriesTable.parentId, id)),
          isNull(categoriesTable.deletedAt),
        ),
      )
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;
    const sqlite = getSQLite();
    const now = nowIso();

    const cases = ids.map((id, index) => `WHEN '${id}' THEN ${index}`).join(' ');
    const placeholders = ids.map((id) => `'${id}'`).join(',');
    sqlite.execSync(
      `UPDATE categories SET sort_order = CASE id ${cases} END, updated_at = '${now}' WHERE id IN (${placeholders})`,
    );
  }
}

export const categoriesRepository = new CategoriesRepository();
