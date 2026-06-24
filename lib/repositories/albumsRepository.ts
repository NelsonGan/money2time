import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { albumsTable, albumTransactionsTable } from '~/lib/db/schema';
import type { Album } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toAlbum } from './mappers';

interface CreateAlbumInput {
  name: string;
  coverPhotoUri?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  sortOrder?: number;
  deletedAt?: string | null;
}

class AlbumsRepository {
  list(): Album[] {
    const db = getDb();
    return db
      .select()
      .from(albumsTable)
      .where(isNull(albumsTable.deletedAt))
      .orderBy(albumsTable.sortOrder, albumsTable.name)
      .all()
      .map(toAlbum);
  }

  getById(id: string): Album | null {
    const db = getDb();
    const row = db
      .select()
      .from(albumsTable)
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
      .get();
    return row ? toAlbum(row) : null;
  }

  create(input: CreateAlbumInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    // New albums sort to the top of the list, so use one below the current
    // minimum sortOrder (the list is ordered ascending).
    const minSort = db
      .select({ minSort: sql<number>`coalesce(min(${albumsTable.sortOrder}), 0)` })
      .from(albumsTable)
      .where(isNull(albumsTable.deletedAt))
      .get();
    const nextSortOrder = input.sortOrder ?? (minSort?.minSort ?? 0) - 1;

    db.insert(albumsTable)
      .values({
        id,
        name: input.name,
        coverPhotoUri: input.coverPhotoUri ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateAlbumInput>) {
    const db = getDb();
    db.update(albumsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
      .run();
  }

  reorder(ids: string[]) {
    if (ids.length === 0) return;

    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      ids.forEach((id, index) => {
        db.update(albumsTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  /** Marks one album active (clearing any other), or clears all when id is null. */
  setActive(id: string | null) {
    const db = getDb();
    const now = nowIso();
    db.update(albumsTable)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(albumsTable.isActive, true), isNull(albumsTable.deletedAt)))
      .run();
    if (id) {
      db.update(albumsTable)
        .set({ isActive: true, updatedAt: now })
        .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
        .run();
    }
  }

  getActiveId(): string | null {
    const db = getDb();
    const row = db
      .select({ id: albumsTable.id })
      .from(albumsTable)
      .where(and(eq(albumsTable.isActive, true), isNull(albumsTable.deletedAt)))
      .get();
    return row?.id ?? null;
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();

    db.update(albumsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumsTable.id, id), isNull(albumsTable.deletedAt)))
      .run();

    db.update(albumTransactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumTransactionsTable.albumId, id), isNull(albumTransactionsTable.deletedAt)))
      .run();
  }

  getTransactionIds(albumId: string): string[] {
    const db = getDb();
    return db
      .select({ transactionId: albumTransactionsTable.transactionId })
      .from(albumTransactionsTable)
      .where(
        and(eq(albumTransactionsTable.albumId, albumId), isNull(albumTransactionsTable.deletedAt)),
      )
      .orderBy(albumTransactionsTable.sortOrder)
      .all()
      .map((row) => row.transactionId);
  }

  /**
   * Minimal rows for an album's transactions in a single join query — used for
   * index-card stats so we avoid loading full transaction relations per card.
   */
  getStatRows(
    albumId: string,
  ): { type: string; date: string; amount: number; reportingAmount: number | null }[] {
    return getSQLite().getAllSync<{
      type: string;
      date: string;
      amount: number;
      reportingAmount: number | null;
    }>(
      `SELECT t.type AS type, t.date AS date, t.amount AS amount, t.reporting_amount AS reportingAmount
       FROM album_transactions axn
       INNER JOIN transactions t ON t.id = axn.transaction_id
       WHERE axn.album_id = ? AND axn.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [albumId],
    );
  }

  addTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0) return;

    const db = getDb();
    const sqlite = getSQLite();
    const now = nowIso();
    const existing = new Set(this.getTransactionIds(albumId));
    const toAdd = transactionIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;

    const baseSort = existing.size;

    sqlite.execSync('BEGIN');
    try {
      toAdd.forEach((transactionId, index) => {
        db.insert(albumTransactionsTable)
          .values({
            id: newId(),
            albumId,
            transactionId,
            sortOrder: baseSort + index,
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

  removeTransactions(albumId: string, transactionIds: string[]) {
    if (transactionIds.length === 0) return;

    const db = getDb();
    const now = nowIso();
    db.update(albumTransactionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumTransactionsTable.albumId, albumId),
          inArray(albumTransactionsTable.transactionId, transactionIds),
          isNull(albumTransactionsTable.deletedAt),
        ),
      )
      .run();
  }
}

export const albumsRepository = new AlbumsRepository();
