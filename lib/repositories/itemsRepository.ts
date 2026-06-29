import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { itemsTable } from '~/lib/db/schema';
import type { Item } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toItem } from './mappers';

interface CreateItemInput {
  name: string;
  iconId?: string | null;
  purchasePrice: number;
  currency: string;
  purchaseDate: string;
  endDate?: string | null;
  salePrice?: number | null;
  note?: string | null;
  sortOrder?: number;
  deletedAt?: string | null;
}

class ItemsRepository {
  list(): Item[] {
    const db = getDb();
    return db
      .select()
      .from(itemsTable)
      .where(isNull(itemsTable.deletedAt))
      .orderBy(itemsTable.sortOrder, itemsTable.name)
      .all()
      .map(toItem);
  }

  create(input: CreateItemInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    // New items sort to the top of the list, so use one below the current
    // minimum sortOrder (the list is ordered ascending).
    const minSort = db
      .select({ minSort: sql<number>`coalesce(min(${itemsTable.sortOrder}), 0)` })
      .from(itemsTable)
      .where(isNull(itemsTable.deletedAt))
      .get();
    const nextSortOrder = input.sortOrder ?? (minSort?.minSort ?? 0) - 1;

    db.insert(itemsTable)
      .values({
        id,
        name: input.name,
        iconId: input.iconId ?? null,
        purchasePrice: input.purchasePrice,
        currency: input.currency,
        purchaseDate: input.purchaseDate,
        endDate: input.endDate ?? null,
        salePrice: input.salePrice ?? null,
        note: input.note ?? null,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateItemInput>) {
    const db = getDb();
    db.update(itemsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(itemsTable.id, id), isNull(itemsTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(itemsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(itemsTable.id, id), isNull(itemsTable.deletedAt)))
      .run();
  }
}

export const itemsRepository = new ItemsRepository();
