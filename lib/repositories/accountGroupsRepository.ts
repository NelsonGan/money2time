import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { accountGroupsTable, accountsTable } from '~/lib/db/schema';
import type { AccountGroup } from '~/types';
import { newId, nowIso } from '~/utils/id';
import { toAccountGroup } from './mappers';

class AccountGroupsRepository {
  list(): AccountGroup[] {
    const db = getDb();
    return db
      .select()
      .from(accountGroupsTable)
      .where(isNull(accountGroupsTable.deletedAt))
      .orderBy(accountGroupsTable.sortOrder, accountGroupsTable.name)
      .all()
      .map(toAccountGroup);
  }

  create(name: string, sortOrder?: number): string | null {
    const normalized = name.trim();
    if (!normalized) return null;
    const db = getDb();
    const existing = db
      .select()
      .from(accountGroupsTable)
      .where(
        and(
          isNull(accountGroupsTable.deletedAt),
          sql`lower(${accountGroupsTable.name}) = lower(${normalized})`,
        ),
      )
      .get();
    if (existing) return existing.id;

    const maxSort = db
      .select({ maxSort: sql<number>`coalesce(max(${accountGroupsTable.sortOrder}), -1)` })
      .from(accountGroupsTable)
      .where(isNull(accountGroupsTable.deletedAt))
      .get();

    const id = newId();
    const now = nowIso();
    const parsedSortOrder =
      sortOrder !== undefined && Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : null;

    db.insert(accountGroupsTable)
      .values({
        id,
        name: normalized,
        sortOrder: parsedSortOrder ?? (maxSort?.maxSort ?? -1) + 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return id;
  }

  rename(id: string, nextName: string) {
    const normalized = nextName.trim();
    if (!normalized) return;
    const db = getDb();
    const row = db
      .select()
      .from(accountGroupsTable)
      .where(and(eq(accountGroupsTable.id, id), isNull(accountGroupsTable.deletedAt)))
      .get();
    if (!row) return;

    const duplicate = db
      .select()
      .from(accountGroupsTable)
      .where(
        and(
          isNull(accountGroupsTable.deletedAt),
          sql`lower(${accountGroupsTable.name}) = lower(${normalized})`,
        ),
      )
      .get();
    if (duplicate && duplicate.id !== id) return;

    const now = nowIso();
    db.update(accountGroupsTable)
      .set({ name: normalized, updatedAt: now })
      .where(and(eq(accountGroupsTable.id, id), isNull(accountGroupsTable.deletedAt)))
      .run();

    db.update(accountsTable)
      .set({ accountGroup: normalized, updatedAt: now })
      .where(and(eq(accountsTable.accountGroup, row.name), isNull(accountsTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const row = db
      .select()
      .from(accountGroupsTable)
      .where(and(eq(accountGroupsTable.id, id), isNull(accountGroupsTable.deletedAt)))
      .get();
    if (!row) return;

    const now = nowIso();
    db.update(accountsTable)
      .set({ accountGroup: null, updatedAt: now })
      .where(and(eq(accountsTable.accountGroup, row.name), isNull(accountsTable.deletedAt)))
      .run();

    db.update(accountGroupsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(accountGroupsTable.id, id), isNull(accountGroupsTable.deletedAt)))
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;
    setImmediate(() => {
      const db = getDb();
      const now = nowIso();
      ids.forEach((id, index) => {
        db.update(accountGroupsTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(accountGroupsTable.id, id), isNull(accountGroupsTable.deletedAt)))
          .run();
      });
    });
  }

  ensureFromActiveAccounts() {
    const names = getSQLite().getAllSync<{ name: string }>(
      `SELECT DISTINCT TRIM(account_group) as name
       FROM accounts
       WHERE deleted_at IS NULL AND account_group IS NOT NULL AND TRIM(account_group) <> ''`,
    );
    names.forEach((row) => {
      this.create(row.name);
    });
  }
}

export const accountGroupsRepository = new AccountGroupsRepository();
